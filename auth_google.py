"""Real Google sign-in for Aira (OAuth 2.0 authorization-code flow + OpenID Connect).

How it works
  1. /auth/google          sends the person to Google (with a random state, nonce and PKCE challenge).
  2. Google asks them to choose an account and sends them back to /auth/google/callback with a one-time code.
  3. The server exchanges the code for an ID token using the client secret (the secret never reaches the browser).
  4. The server checks the ID token itself: Google's RSA signature, issuer, audience, expiry, nonce and
     email_verified. Only then is a login session created.
The person's identity is Google's unique "sub" value, never an email somebody typed.
No extra libraries are needed (RSA signature checking is done with Python's own integers).
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import urlencode

import requests
from flask import redirect, request

# Google's public addresses. (Tests point these at a local stand-in server; production never changes them.)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")

STATE_COOKIE = "aira_oauth"
STATE_SECONDS = 600
CERT_CACHE_SECONDS = 3600
SHA256_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")   # DigestInfo for SHA-256
EMAIL_OK = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")

_A = None
_certs = {"keys": {}, "time": 0.0}

ERROR_TEXT = {
    "not_configured": "Google sign-in is not set up on this site yet.",
    "denied": "Google sign-in was cancelled.",
    "state": "The sign-in took too long or was opened in another browser. Please try again.",
    "google": "Google could not complete the sign-in. Please try again.",
    "token": "Google sent a sign-in token that could not be trusted, so you were not logged in.",
    "unverified": "Your Google email address is not verified, so you cannot log in with it.",
    "conflict": "This email already belongs to a different Google account on Aira.",
    "busy": "Too many sign-in tries. Please wait a few minutes.",
}


class AuthError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(code)
        self.code = code
        self.detail = detail


# ------------------------------------------------------------------ settings
def _env(name):
    return os.environ.get(name, "").strip().strip("\"'").strip()


def client_id():
    return _env("GOOGLE_CLIENT_ID")


def redirect_uri():
    return _env("GOOGLE_REDIRECT_URI")


def session_secret():
    return _env("SESSION_SECRET")


def admin_email():
    return _env("ADMIN_EMAIL").lower()


def enabled():
    """Google login is on only when everything it needs is set."""
    uri = redirect_uri()
    safe_uri = uri.startswith("https://") or uri.startswith("http://localhost") or uri.startswith("http://127.0.0.1")
    return bool(client_id() and _env("GOOGLE_CLIENT_SECRET") and safe_uri and len(session_secret()) >= 16)


def password_login_enabled():
    """Old email+password accounts. Off as soon as Google login is on (unless PASSWORD_LOGIN=1)."""
    setting = _env("PASSWORD_LOGIN")
    if setting in ("0", "1"):
        return setting == "1"
    return not enabled()


def missing_settings():
    """Names of the settings that are not usable yet (for the /status page)."""
    out = []
    if not client_id():
        out.append("GOOGLE_CLIENT_ID")
    if not _env("GOOGLE_CLIENT_SECRET"):
        out.append("GOOGLE_CLIENT_SECRET")
    uri = redirect_uri()
    if not (uri.startswith("https://") or uri.startswith("http://localhost") or uri.startswith("http://127.0.0.1")):
        out.append("GOOGLE_REDIRECT_URI (must start with https://)")
    if len(session_secret()) < 16:
        out.append("SESSION_SECRET (at least 16 random characters)")
    return out


# ------------------------------------------------------------------ small helpers
def b64d(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def b64e(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(payload_b64):
    key = hashlib.sha256(b"aira-oauth-state|" + session_secret().encode()).digest()
    return b64e(hmac.new(key, payload_b64.encode(), hashlib.sha256).digest())


def make_state_cookie(state, nonce, verifier):
    payload = b64e(json.dumps({"s": state, "n": nonce, "v": verifier, "t": int(time.time())}).encode())
    return payload + "." + _sign(payload)


def read_state_cookie(value):
    try:
        payload, signature = value.split(".")
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        data = json.loads(b64d(payload))
        if time.time() - int(data["t"]) > STATE_SECONDS or time.time() < int(data["t"]) - 5:
            return None
        return data
    except (ValueError, KeyError, TypeError):
        return None


# ------------------------------------------------------------------ Google's public keys
def _load_certs(force=False):
    if not force and _certs["keys"] and time.time() - _certs["time"] < CERT_CACHE_SECONDS:
        return
    try:
        reply = requests.get(GOOGLE_CERTS_URL, timeout=6)
        reply.raise_for_status()
        keys = {}
        for jwk in reply.json().get("keys", []):
            if jwk.get("kty") == "RSA" and jwk.get("kid") and jwk.get("n") and jwk.get("e"):
                keys[jwk["kid"]] = (int.from_bytes(b64d(jwk["n"]), "big"), int.from_bytes(b64d(jwk["e"]), "big"))
    except (requests.exceptions.RequestException, ValueError) as error:
        raise AuthError("google", "could not load Google's public keys: %s" % type(error).__name__)
    if not keys:
        raise AuthError("google", "Google's public keys were empty")
    _certs["keys"], _certs["time"] = keys, time.time()


def _key_for(kid):
    _load_certs()
    if kid not in _certs["keys"]:
        _load_certs(force=True)          # Google may have rotated its keys
    if kid not in _certs["keys"]:
        raise AuthError("token", "unknown signing key")
    return _certs["keys"][kid]


def rsa_sha256_ok(message, signature, n, e):
    """RSASSA-PKCS1-v1_5 with SHA-256 (RS256) check."""
    size = (n.bit_length() + 7) // 8
    if len(signature) != size:
        return False
    decrypted = pow(int.from_bytes(signature, "big"), e, n).to_bytes(size, "big")
    digest_info = SHA256_PREFIX + hashlib.sha256(message).digest()
    expected = b"\x00\x01" + b"\xff" * (size - len(digest_info) - 3) + b"\x00" + digest_info
    return hmac.compare_digest(decrypted, expected)


def verify_id_token(token, expected_nonce, now=None):
    """Return Google's claims if the ID token can be trusted, otherwise raise AuthError."""
    now = now if now is not None else time.time()
    if not isinstance(token, str) or token.count(".") != 2 or len(token) > 6000:
        raise AuthError("token", "not a JWT")
    head_b64, body_b64, sig_b64 = token.split(".")
    try:
        header = json.loads(b64d(head_b64))
        claims = json.loads(b64d(body_b64))
        signature = b64d(sig_b64)
    except (ValueError, TypeError):
        raise AuthError("token", "unreadable token")
    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise AuthError("token", "bad token shape")
    if header.get("alg") != "RS256":
        raise AuthError("token", "algorithm is not RS256")      # blocks "none" and HMAC tricks
    kid = header.get("kid")
    if not isinstance(kid, str):
        raise AuthError("token", "no key id")
    n, e = _key_for(kid)
    if not rsa_sha256_ok((head_b64 + "." + body_b64).encode(), signature, n, e):
        raise AuthError("token", "signature does not match")
    if claims.get("iss") not in ISSUERS:
        raise AuthError("token", "wrong issuer")
    audience = claims.get("aud")
    if audience != client_id() and not (isinstance(audience, list) and client_id() in audience and claims.get("azp") == client_id()):
        raise AuthError("token", "token was made for another app")
    try:
        expires, issued = float(claims["exp"]), float(claims.get("iat", now))
    except (KeyError, TypeError, ValueError):
        raise AuthError("token", "no expiry")
    if expires < now - 30:
        raise AuthError("token", "token expired")
    if issued > now + 300:
        raise AuthError("token", "token is from the future")
    if not isinstance(claims.get("nonce"), str) or not hmac.compare_digest(claims["nonce"], expected_nonce):
        raise AuthError("token", "nonce does not match")
    sub, email = claims.get("sub"), claims.get("email")
    if not isinstance(sub, str) or not sub or len(sub) > 255:
        raise AuthError("token", "no user id")
    if not isinstance(email, str) or not EMAIL_OK.match(email) or len(email) > 120:
        raise AuthError("token", "no email")
    if claims.get("email_verified") not in (True, "true"):
        raise AuthError("unverified")
    return claims


# ------------------------------------------------------------------ users
def save_google_user(conn, claims):
    """Create or update the Aira account for this Google identity. Returns its id."""
    sub = claims["sub"]
    email = claims["email"].strip().lower()
    name = " ".join(str(claims.get("name") or email.split("@")[0]).split())[:100]
    picture = claims.get("picture") if isinstance(claims.get("picture"), str) else ""
    picture = picture if picture.startswith("https://") and len(picture) <= 500 else ""
    stamp = _A.datetime.now(_A.timezone(_A.timedelta(hours=_A.CFG.tz_hours))).strftime("%Y-%m-%d %H:%M")

    row = conn.execute("SELECT id FROM users WHERE google_sub = ?", (sub,)).fetchone()
    if row:
        try:
            conn.execute("UPDATE users SET email = ?, name = ?, picture = ?, last_login = ?, email_verified = 1 WHERE id = ?",
                         (email, name, picture, stamp, row[0]))
        except _A.sqlite3.IntegrityError:      # the new address belongs to another row: keep the old one
            conn.execute("UPDATE users SET name = ?, picture = ?, last_login = ?, email_verified = 1 WHERE id = ?",
                         (name, picture, stamp, row[0]))
        return row[0]

    old = conn.execute("SELECT id, google_sub FROM users WHERE email = ?", (email,)).fetchone()
    if old and old[1]:
        raise AuthError("conflict")
    if old:
        # An older email+password account. Google has now proven the owner of this address, so link it.
        # The old password is erased and old sessions are ended: somebody else could have typed this
        # email when it was not verified, and must not keep access.
        conn.execute("UPDATE users SET google_sub = ?, name = ?, picture = ?, last_login = ?, email_verified = 1, pw = '' WHERE id = ?",
                     (sub, name, picture, stamp, old[0]))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (old[0],))
        return old[0]
    cursor = conn.execute(
        "INSERT INTO users (email, pw, created, google_sub, name, picture, last_login, email_verified) VALUES (?, '', ?, ?, ?, ?, ?, 1)",
        (email, _A.today(), sub, name, picture, stamp))
    return cursor.lastrowid


def is_admin(user_id):
    """True only for the Google-verified account whose email equals ADMIN_EMAIL."""
    wanted = admin_email()
    if not wanted or not user_id:
        return False
    with _A.db() as conn:
        row = conn.execute("SELECT email, google_sub, email_verified FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row and row[1] and row[2] == 1 and row[0].lower() == wanted)


# ------------------------------------------------------------------ routes
def _fail(code):
    resp = redirect("/?auth_error=" + code + "#/home")
    resp.delete_cookie(STATE_COOKIE, path="/auth")
    resp.headers["Cache-Control"] = "no-store"
    return resp


def register(A):
    global _A
    _A = A
    app = A.app

    @app.get("/auth/google")
    def google_start():
        if not enabled():
            return _fail("not_configured")
        if A.too_many("gstart:" + A.who_is(), 20, 600):
            return _fail("busy")
        state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
        challenge = b64e(hashlib.sha256(verifier.encode()).digest())
        query = urlencode({
            "client_id": client_id(), "redirect_uri": redirect_uri(), "response_type": "code",
            "scope": "openid email profile", "state": state, "nonce": nonce,
            "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account",
        })
        resp = redirect(GOOGLE_AUTH_URL + "?" + query)
        resp.set_cookie(STATE_COOKIE, make_state_cookie(state, nonce, verifier), max_age=STATE_SECONDS, httponly=True,
                        samesite="Lax", secure=redirect_uri().startswith("https://"), path="/auth")
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/auth/google/callback")
    def google_callback():
        if not enabled():
            return _fail("not_configured")
        if A.too_many("gcb:" + A.who_is(), 30, 600):
            return _fail("busy")
        saved = read_state_cookie(request.cookies.get(STATE_COOKIE, ""))
        if request.args.get("error"):
            return _fail("denied")
        got_state, code = request.args.get("state", ""), request.args.get("code", "")
        if not saved or not got_state or not hmac.compare_digest(saved["s"], got_state):
            return _fail("state")
        if not code or len(code) > 2000:
            return _fail("google")
        try:
            reply = requests.post(GOOGLE_TOKEN_URL, data={
                "code": code, "client_id": client_id(), "client_secret": _env("GOOGLE_CLIENT_SECRET"),
                "redirect_uri": redirect_uri(), "grant_type": "authorization_code", "code_verifier": saved["v"],
            }, timeout=(6, 15))
        except requests.exceptions.RequestException as error:
            print("[google] token request failed: %s" % type(error).__name__, flush=True)
            return _fail("google")
        if reply.status_code != 200:
            print("[google] token endpoint answered %s" % reply.status_code, flush=True)   # never print the body or secrets
            return _fail("google")
        try:
            id_token = reply.json().get("id_token")
            claims = verify_id_token(id_token, saved["n"])
            with A.db() as conn:
                user_id = save_google_user(conn, claims)
        except AuthError as error:
            print("[google] sign-in refused: %s %s" % (error.code, error.detail), flush=True)
            return _fail(error.code if error.code in ERROR_TEXT else "token")
        except ValueError:
            return _fail("google")
        resp = redirect("/#/home")
        resp.delete_cookie(STATE_COOKIE, path="/auth")
        resp.headers["Cache-Control"] = "no-store"
        return A.start_session(resp, user_id)
