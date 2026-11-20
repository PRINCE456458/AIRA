"""Tiny client for Turso (a free online SQLite database) over plain HTTPS.

It looks like the sqlite3 module (execute / fetchone / fetchall), so the rest of app.py does not care
whether it talks to a local file or to Turso. Only needs the `requests` library.
"""
import base64
import sqlite3
import time

import requests

LOG = None   # app.py sets this to a function(level, event, **fields) so retries show up in the logs


class TursoError(Exception):
    """kind: network (cannot reach / timeout), busy (429/5xx), auth (401/403), url (404/400), sql (a command failed)."""

    def __init__(self, message, kind="sql", status=None):
        super().__init__(message)
        self.kind = kind
        self.status = status


class Cursor:
    def __init__(self, rows=None, rowcount=0, lastrowid=None):
        self.rows = rows or []
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)

    def __iter__(self):
        return iter(self.rows)


def _arg(value):
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, (bytes, bytearray)):
        return {"type": "blob", "base64": base64.b64encode(bytes(value)).decode()}
    return {"type": "text", "value": str(value)}


def _value(cell):
    kind, raw = cell.get("type"), cell.get("value")
    if kind == "null" or raw is None and kind != "blob":
        return None
    if kind == "integer":
        return int(raw)
    if kind == "float":
        return float(raw)
    if kind == "blob":
        return base64.b64decode(cell.get("base64", "") + "==")
    return raw


class Turso:
    def __init__(self, url, token, timeout=15):
        url = url.strip().strip("\"'").rstrip("/")
        token = token.strip().strip("\"'")
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        elif url.startswith("wss://"):
            url = "https://" + url[len("wss://"):]
        self.endpoint = url + "/v2/pipeline"
        self.token = token
        self.timeout = timeout
        self.http = None
        self._new_session()

    def _new_session(self):
        """A fresh connection. A connection kept from an earlier request can be dead (the server frozen or
        Turso closed it), so after any network error we never reuse it."""
        self.http = requests.Session()
        self.http.headers.update({"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})

    def _post(self, payload, read_only):
        """POST with up to 3 tries. Retries only what is safe: network errors and 429/502/503/504."""
        last = None
        for attempt in range(3):
            try:
                reply = self.http.post(self.endpoint, json=payload, timeout=self.timeout)
            except requests.exceptions.RequestException as error:
                self._new_session()
                last = TursoError(f"could not reach the database ({type(error).__name__})", "network")
                # A timeout while waiting for the answer may mean the command already ran, so only repeat reads.
                waiting = isinstance(error, requests.exceptions.Timeout) and not isinstance(error, requests.exceptions.ConnectTimeout)
                if attempt < 2 and (read_only or not waiting):
                    self._note(attempt, "network", type(error).__name__)
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise last
            if reply.status_code in (429, 502, 503, 504) and attempt < 2:
                self._note(attempt, "busy", reply.status_code)
                time.sleep(0.4 * (attempt + 1))
                continue
            return reply
        raise last

    def _note(self, attempt, kind, detail):
        if LOG:
            LOG("warn", "db_retry", attempt=attempt + 1, kind=kind, detail=str(detail))

    def _run(self, statements):
        requests_list = [
            {"type": "execute", "stmt": {"sql": sql, "args": [_arg(p) for p in params]}}
            for sql, params in statements
        ]
        requests_list.append({"type": "close"})
        read_only = all(sql.lstrip().upper().startswith(("SELECT", "PRAGMA")) for sql, _ in statements)
        reply = self._post({"requests": requests_list}, read_only)
        if reply.status_code != 200:
            body = reply.text[:160].replace(self.token, "***") if self.token else reply.text[:160]
            if reply.status_code in (401, 403):
                raise TursoError(f"database refused the login (HTTP {reply.status_code}): {body}", "auth", reply.status_code)
            if reply.status_code in (400, 404):
                raise TursoError(f"database address not accepted (HTTP {reply.status_code}): {body}", "url", reply.status_code)
            raise TursoError(f"database answered HTTP {reply.status_code}: {body}", "busy" if reply.status_code >= 500 or reply.status_code == 429 else "sql", reply.status_code)
        try:
            results = reply.json().get("results", [])
        except ValueError:
            raise TursoError("the database sent an unreadable answer", "busy", reply.status_code)
        cursors = []
        for item in results[: len(statements)]:
            if item.get("type") == "error":
                message = (item.get("error") or {}).get("message", "database error")
                lowered = message.lower()
                if "constraint failed" in lowered or "unique constraint" in lowered:
                    raise sqlite3.IntegrityError(message)
                raise TursoError(message, "sql")
            result = item["response"]["result"]
            rows = [tuple(_value(cell) for cell in row) for row in result.get("rows", [])]
            last = result.get("last_insert_rowid")
            cursors.append(Cursor(rows, result.get("affected_row_count", 0) or 0, int(last) if last is not None else None))
        if len(cursors) != len(statements):
            raise TursoError("the database sent an incomplete answer", "busy")
        return cursors

    def execute(self, sql, params=()):
        return self._run([(sql, tuple(params))])[0]

    def batch(self, statements):
        """Run several statements in ONE request. statements = [(sql, params), ...]"""
        self._run([(sql, tuple(params)) for sql, params in statements])
