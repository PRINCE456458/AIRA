"""Error logging and diagnosis for Aira. One JSON line per event on stderr (Vercel > Logs shows it).

Secrets are removed from everything that is logged or shown: the Turso token, API keys, session secrets,
"Bearer ..." headers and JWT-looking strings.
"""
import json
import os
import re
import sqlite3
import sys
import time

SECRET_ENV = ("TURSO_AUTH_TOKEN", "AI_API_KEY", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "IMAGE_API_KEY", "ADMIN_PASSWORD")
_JWT = re.compile(r"eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}")
_BEARER = re.compile(r"(?i)(bearer|authToken=|token=|key=)\s*[\w\-\.~+/=]{8,}")

last_problem = {}      # the most recent database problem seen by this running instance (shown on /status)


def redact(text):
    text = str(text)
    for name in SECRET_ENV:
        value = os.environ.get(name, "").strip().strip("\"'")
        if len(value) >= 6:
            text = text.replace(value, "***")
    text = _JWT.sub("***", text)
    return _BEARER.sub(lambda m: m.group(1) + " ***", text)


def log(level, event, **fields):
    """Print one JSON line. Never raises."""
    try:
        record = {"t": round(time.time(), 3), "level": level, "event": event}
        for key, value in fields.items():
            record[key] = redact(value)[-3500:] if isinstance(value, str) else value
        print(json.dumps(record, ensure_ascii=False), file=sys.stderr, flush=True)
    except Exception:
        pass


# category -> (HTTP status, what a visitor is told, advice for the owner)
CATEGORIES = {
    "network": (503, "Aira could not reach its database for a moment. Please try again.",
                "The server could not reach Turso (network problem, timeout or a connection that went stale). Check the Turso dashboard for an outage and that TURSO_DATABASE_URL is correct."),
    "busy": (503, "Aira's database is busy for a moment. Please try again.",
             "Turso answered 429/5xx (busy, rate-limited or restarting). Check the Turso dashboard for limits or an outage."),
    "auth": (503, "Aira's database connection needs attention from the site owner.",
             "Turso refused the login (401/403). TURSO_AUTH_TOKEN is wrong, expired or belongs to another database. Create a new token for THIS database and update it in Vercel, then redeploy."),
    "url": (503, "Aira's database connection needs attention from the site owner.",
            "Turso said the address is wrong (404/400). Check TURSO_DATABASE_URL: it looks like libsql://your-db-name-your-user.turso.io"),
    "sql": (503, "Aira had a problem saving or loading data. Please try again in a moment.",
            "The database answered but refused a command (see the 'message' field in the Vercel log line: for example a missing table or column)."),
    "code": (500, "Aira ran into an unexpected problem. Please try again in a moment.",
             "This is a bug in Aira's code, not the database. The Vercel log line with this ref has the traceback."),
}


def classify(error):
    """-> category name for an exception."""
    kind = getattr(error, "kind", None)
    if kind in CATEGORIES:
        return kind
    if isinstance(error, sqlite3.Error):
        return "sql"
    return "code"


def public_message(category, ref):
    return f"{CATEGORIES[category][1]} (ref {ref})"


def remember(category, error):
    last_problem.update(category=category, when=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
                        what=redact(f"{type(error).__name__}: {error}")[:200])
