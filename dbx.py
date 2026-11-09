"""Tiny client for Turso (a free online SQLite database) over plain HTTPS.

It looks like the sqlite3 module (execute / fetchone / fetchall), so the rest of app.py does not care
whether it talks to a local file or to Turso. Only needs the `requests` library.
"""
import base64
import sqlite3

import requests


class TursoError(Exception):
    pass


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
        url = url.strip().rstrip("/")
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        self.endpoint = url + "/v2/pipeline"
        self.http = requests.Session()
        self.http.headers.update({"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        self.timeout = timeout

    def _run(self, statements):
        requests_list = [
            {"type": "execute", "stmt": {"sql": sql, "args": [_arg(p) for p in params]}}
            for sql, params in statements
        ]
        requests_list.append({"type": "close"})
        try:
            reply = self.http.post(self.endpoint, json={"requests": requests_list}, timeout=self.timeout)
        except requests.exceptions.RequestException as error:
            raise TursoError(f"could not reach the database: {error}")
        if reply.status_code != 200:
            raise TursoError(f"database answered {reply.status_code}: {reply.text[:200]}")
        results = reply.json().get("results", [])
        cursors = []
        for item in results[: len(statements)]:
            if item.get("type") == "error":
                message = (item.get("error") or {}).get("message", "database error")
                if "constraint" in message.lower() or "unique" in message.lower():
                    raise sqlite3.IntegrityError(message)
                raise TursoError(message)
            result = item["response"]["result"]
            rows = [tuple(_value(cell) for cell in row) for row in result.get("rows", [])]
            last = result.get("last_insert_rowid")
            cursors.append(Cursor(rows, result.get("affected_row_count", 0) or 0, int(last) if last is not None else None))
        if len(cursors) != len(statements):
            raise TursoError("the database sent an incomplete answer")
        return cursors

    def execute(self, sql, params=()):
        return self._run([(sql, tuple(params))])[0]

    def batch(self, statements):
        """Run several statements in ONE request. statements = [(sql, params), ...]"""
        self._run([(sql, tuple(params)) for sql, params in statements])
