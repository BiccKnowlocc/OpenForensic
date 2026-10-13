"""Explicit supported schemas. Unknown structures remain preserved and are reported."""
from __future__ import annotations
import datetime as dt
import json
import re
import sqlite3
from pathlib import Path

def utc(value, milliseconds: bool = False):
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str) and not re.fullmatch(r"-?\d+(?:\.\d+)?", value):
            stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                return None
        else:
            stamp = dt.datetime.fromtimestamp(float(value) / (1000 if milliseconds else 1), dt.timezone.utc)
        return stamp.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError, TypeError):
        return None

def message(platform, stamp, sender, receiver, text, thread, locator, media=None, deleted=0, confidence="high"):
    return {"type": "message", "timestamp_utc": stamp, "platform": platform, "sender_id": str(sender or "unknown"),
            "receiver_id": str(receiver or "unknown"), "message_text": str(text or ""), "media_path": media,
            "is_deleted_flag": deleted, "thread_id": f"{platform}:{thread}", "source_locator": locator, "confidence": confidence}

def provider(path: Path, kind: str, warnings: list[str]):
    if path.stat().st_size > 128 * 1024 * 1024:
        raise ValueError("Provider response exceeds 128 MiB parsing limit")
    text = path.read_text("utf-8", errors="replace")
    rows = re.split(r"(?m)^Row: \d+\s+", text)[1:]
    warnings.append(f"{path.name}: content query output is an ambiguous text serialization; verify values against the preserved raw response.")
    for index, row in enumerate(rows):
        values = dict(re.findall(r"(?:^|, )([A-Za-z_][A-Za-z_0-9]*)=(.*?)(?=, [A-Za-z_][A-Za-z_0-9]*=|$)", row.rstrip(), re.S))
        locator = f"{path.name}:provider-row={index}"
        if kind == "provider-sms":
            outgoing = values.get("type") == "2"
            address = values.get("address", "unknown")
            yield message("SMS", utc(values.get("date"), True), "device" if outgoing else address,
                          address if outgoing else "device", values.get("body", ""), values.get("thread_id", address), locator, confidence="low")
        else:
            yield {"type": "auxiliary", "kind": kind, "source_locator": locator, "data_json": json.dumps(values, ensure_ascii=False)}

def quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'

def sqlite_messages(path: Path, warnings: list[str]):
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    connection.execute("PRAGMA trusted_schema=OFF")
    connection.set_progress_handler(lambda: 0, 10000)
    tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    supported = False
    try:
        def columns(table):
            return {r[1] for r in connection.execute(f"PRAGMA table_info({quote(table)})")}
        if "sms" in tables and {"date", "address", "body", "type"} <= columns("sms"):
            supported = True
            for index, row in enumerate(connection.execute('SELECT * FROM "sms"')):
                r = dict(row); outgoing = r.get("type") == 2; address = r.get("address") or "unknown"
                yield message("SMS", utc(r["date"], True), "device" if outgoing else address, address if outgoing else "device",
                              r["body"], r.get("thread_id", address), f"{path.name}:sms:_id={r.get('_id', index)}",
                              deleted=1 if r.get("deleted") == 1 else 0)
        if {"pdu", "part", "addr"} <= tables and {"_id", "date", "msg_box"} <= columns("pdu") and {"mid", "text", "ct"} <= columns("part") and {"msg_id", "address", "type"} <= columns("addr"):
            supported = True
            for row in connection.execute('SELECT * FROM "pdu"'):
                r = dict(row); key = r["_id"]
                parts = [dict(v) for v in connection.execute('SELECT * FROM "part" WHERE mid=?', (key,))]
                addresses = [dict(v) for v in connection.execute('SELECT * FROM "addr" WHERE msg_id=?', (key,))]
                sender = next((v["address"] for v in addresses if v["type"] == 137), "unknown")
                receiver = ", ".join(str(v["address"]) for v in addresses if v["type"] == 151) or "unknown"
                texts = "\n".join(str(v["text"]) for v in parts if v["ct"] == "text/plain" and v.get("text"))
                media = next((v.get("_data") for v in parts if v["ct"] != "text/plain"), None)
                yield message("MMS", utc(r["date"]), sender, receiver, texts, r.get("thread_id", receiver), f"{path.name}:pdu:_id={key}", media)
        if "messages" in tables and {"key_remote_jid", "key_from_me", "data", "timestamp"} <= columns("messages"):
            supported = True
            for index, row in enumerate(connection.execute('SELECT * FROM "messages"')):
                r = dict(row); remote = r["key_remote_jid"]; outgoing = r["key_from_me"] == 1
                yield message("WhatsApp", utc(r["timestamp"], True), "device" if outgoing else r.get("remote_resource") or remote,
                              remote if outgoing else "device", r["data"], remote, f"{path.name}:messages:_id={r.get('_id', index)}",
                              r.get("media_name"), deleted=1 if r.get("deleted") == 1 else 0)
        if {"message", "chat", "jid"} <= tables and {"_id", "chat_row_id", "from_me", "timestamp", "text_data"} <= columns("message") and {"_id", "jid_row_id"} <= columns("chat") and {"_id", "raw_string"} <= columns("jid"):
            supported = True
            query = 'SELECT m.*,j.raw_string AS of_remote FROM message m JOIN chat c ON c._id=m.chat_row_id JOIN jid j ON j._id=c.jid_row_id'
            for row in connection.execute(query):
                r = dict(row); remote = r["of_remote"]; outgoing = r["from_me"] == 1
                sender = "device" if outgoing else remote
                if not outgoing and r.get("sender_jid_row_id"):
                    jid = connection.execute('SELECT raw_string FROM jid WHERE _id=?', (r["sender_jid_row_id"],)).fetchone()
                    sender = jid[0] if jid else sender
                yield message("WhatsApp", utc(r["timestamp"], True), sender, remote if outgoing else "device", r["text_data"], remote,
                              f"{path.name}:message:_id={r['_id']}", deleted=1 if r.get("deleted") == 1 else 0)
        if "rcs_messages" in tables and {"timestamp", "sender", "recipient", "body"} <= columns("rcs_messages"):
            supported = True
            warnings.append(f"{path.name}: RCS adapter uses the explicit rcs_messages export contract (Unix milliseconds); vendor-private schemas require their own adapter.")
            for index, row in enumerate(connection.execute('SELECT * FROM "rcs_messages"')):
                r = dict(row)
                yield message("RCS", utc(r["timestamp"], True), r["sender"], r["recipient"], r["body"], r.get("thread_id", r["recipient"]),
                              f"{path.name}:rcs_messages:row={index}", r.get("media_path"), 1 if r.get("deleted") == 1 else 0)
        if not supported:
            warnings.append(f"{path.name}: no supported communications schema. Raw evidence and carved candidates are retained.")
    finally:
        connection.close()

def json_messages(path: Path, warnings: list[str]):
    if path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("JSON export exceeds 64 MiB parsing limit")
    data = json.loads(path.read_text("utf-8-sig"))
    if isinstance(data, dict) and isinstance(data.get("messages"), list) and isinstance(data.get("participants"), list):
        participants = [str(p.get("name", "unknown")) for p in data["participants"]]
        for index, r in enumerate(data["messages"]):
            sender = r.get("sender_name", "unknown")
            receiver = ", ".join(p for p in participants if p != sender) or "unknown"
            media = next((a.get("uri") for k in ("photos", "audio_files", "videos", "files") for a in r.get(k, []) if isinstance(a, dict)), None)
            yield message("Messenger", utc(r.get("timestamp_ms"), True), sender, receiver, r.get("content", ""),
                          data.get("thread_path") or data.get("title") or path.parent.name, f"{path.name}:messages:index={index}", media,
                          1 if r.get("is_unsent") else 0)
    elif isinstance(data, list):
        required = {"platform", "sender_id", "receiver_id", "message_text", "timestamp_utc"}
        for index, r in enumerate(data):
            if not isinstance(r, dict) or not required <= r.keys():
                warnings.append(f"{path.name}: record {index} does not match the normalized export contract")
                continue
            yield message(str(r["platform"]), utc(r["timestamp_utc"]), r["sender_id"], r["receiver_id"], r["message_text"],
                          r.get("thread_id", r["receiver_id"]), f"{path.name}:index={index}", r.get("media_path"), r.get("is_deleted_flag", 0))
    else:
        warnings.append(f"{path.name}: JSON is not a supported Messenger or normalized communications export")
