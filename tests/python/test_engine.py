import io
import json
import shutil
import sqlite3
import struct
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "engine"))
from carver_sqlite import carve, record, varint, checksum
from formats import protobuf_wire, preferences
from normalizers import sqlite_messages, json_messages, utc
from runner import extract_archive, run

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="openforensic-test-")
        self.root = Path(self.temp.name)
    def tearDown(self):
        self.temp.cleanup()
    def test_record_types_and_truncation(self):
        data = b"\x03\x01\x1d\x2a" + b"removed!"
        self.assertEqual(record(data, 0, len(data)), ([42, "removed!"], len(data)))
        with self.assertRaises(ValueError):
            record(data, 0, len(data) - 1)
        self.assertEqual(varint(b"\x81\x00", 0), (128, 2))
    def test_freelist_recovers_values_without_asserting_deletion(self):
        path = self.root / "free.db"
        connection = sqlite3.connect(path)
        connection.executescript("PRAGMA page_size=512; PRAGMA secure_delete=OFF; CREATE TABLE old(id INTEGER, body TEXT);")
        connection.executemany("INSERT INTO old VALUES(?,?)", [(i, f"recoverable record {i} " + "x" * 40) for i in range(200)])
        connection.commit(); connection.execute("DROP TABLE old"); connection.commit(); connection.close()
        warnings = []
        result = list(carve(path, warnings))
        self.assertTrue(any("recoverable record" in r["values_json"] for r in result))
        self.assertTrue(all(r["type"] == "candidate" for r in result))
        self.assertTrue(any(r["origin"] == "freelist_leaf" for r in result))
    def wal_fixture(self):
        path = self.root / "sms.db"
        connection = sqlite3.connect(path)
        connection.executescript("PRAGMA page_size=512; PRAGMA journal_mode=WAL; PRAGMA secure_delete=OFF; PRAGMA wal_autocheckpoint=0; CREATE TABLE sms(_id INTEGER PRIMARY KEY,date INTEGER,address TEXT,body TEXT,type INTEGER,thread_id INTEGER);")
        connection.commit(); connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        connection.execute("INSERT INTO sms VALUES(1,1700000000000,'alice','historic message',1,7)"); connection.commit()
        connection.execute("DELETE FROM sms"); connection.commit()
        copy = self.root / "copy.db"
        shutil.copyfile(path, copy); shutil.copyfile(Path(str(path) + "-wal"), Path(str(copy) + "-wal")); connection.close()
        return copy
    def test_valid_wal_recovers_history_and_live_query_applies_wal(self):
        path = self.wal_fixture(); warnings = []
        result = list(carve(path, warnings))
        self.assertTrue(any(r["origin"] == "wal_committed" and "historic message" in r["values_json"] for r in result), warnings)
        self.assertEqual(list(sqlite_messages(path, [])), [])
    def test_corrupt_wal_is_excluded(self):
        path = self.wal_fixture(); wal = Path(str(path) + "-wal")
        data = bytearray(wal.read_bytes()); data[32 + 16] ^= 1; wal.write_bytes(data)
        warnings = []; result = list(carve(path, warnings))
        self.assertFalse(any(r["origin"].startswith("wal") for r in result))
        self.assertTrue(any("checksum" in w for w in warnings))
    def test_uncommitted_wal_is_not_called_deleted(self):
        path = self.wal_fixture(); wal = Path(str(path) + "-wal"); data = bytearray(wal.read_bytes())
        size = struct.unpack(">I", data[8:12])[0]; endian = "<" if struct.unpack(">I", data[:4])[0] == 0x377F0682 else ">"
        state = checksum(data[:24], (0, 0), endian)
        for offset in range(32, len(data), 24 + size):
            data[offset + 4:offset + 8] = b"\x00" * 4
            state = checksum(data[offset:offset + 8] + data[offset + 24:offset + 24 + size], state, endian)
            data[offset + 16:offset + 24] = struct.pack(">II", *state)
        wal.write_bytes(data)
        result = list(carve(path, []))
        self.assertTrue(any(r["origin"] == "wal_uncommitted" for r in result))
        self.assertFalse(any(r["origin"] == "wal_committed" for r in result))
    def test_unknown_encrypted_database_is_reported(self):
        path = self.root / "encrypted.db"; path.write_bytes(b"encrypted" * 100)
        warnings = []; self.assertEqual(list(carve(path, warnings)), [])
        self.assertTrue(any("unsupported encrypted" in w for w in warnings))
    def test_sms_whatsapp_and_rcs_normalization(self):
        path = self.root / "apps.db"; connection = sqlite3.connect(path)
        connection.executescript("CREATE TABLE sms(_id,date,address,body,type,thread_id); INSERT INTO sms VALUES(1,1700000000000,'a','sms text',2,1); CREATE TABLE messages(_id,key_remote_jid,key_from_me,data,timestamp); INSERT INTO messages VALUES(1,'b',0,'wa text',1700000000000); CREATE TABLE rcs_messages(timestamp,sender,recipient,body); INSERT INTO rcs_messages VALUES(1700000000000,'c','d','rcs text');")
        connection.close(); result = list(sqlite_messages(path, []))
        self.assertEqual({r["platform"] for r in result}, {"SMS", "WhatsApp", "RCS"})
        self.assertTrue(all(r["timestamp_utc"] == "2023-11-14T22:13:20.000Z" for r in result))
        self.assertEqual(result[0]["sender_id"], "device")
    def test_messenger_and_xml(self):
        path = self.root / "message_1.json"
        path.write_text(json.dumps({"participants": [{"name": "A"}, {"name": "B"}], "messages": [{"sender_name": "A", "timestamp_ms": 1700000000000, "content": "hello", "is_unsent": True}]}))
        result = list(json_messages(path, [])); self.assertEqual(result[0]["receiver_id"], "B"); self.assertEqual(result[0]["is_deleted_flag"], 1)
        xml = self.root / "prefs.xml"; xml.write_text('<map><string name="name">Alice</string><long name="count" value="42"/><set name="labels"><string>a</string></set></map>')
        self.assertEqual(preferences(xml), {"name": "Alice", "count": 42, "labels": ["a"]})
        xml.write_text('<!DOCTYPE map [<!ENTITY x "data">]><map/>')
        with self.assertRaises(ValueError): preferences(xml)
    def test_protobuf_wire_values_and_bounds(self):
        self.assertEqual(protobuf_wire(b"\x08\xac\x02\x12\x03abc")[0]["value"], 300)
        self.assertEqual(protobuf_wire(b"\x08\xac\x02\x12\x03abc")[1]["value"]["utf8"], "abc")
        for invalid in (b"\x12\x05abc", b"\x00", b"\x08\x80", b"\x08" + b"\xff" * 10):
            with self.assertRaises(ValueError): protobuf_wire(invalid)
    def test_tar_rejects_traversal_and_excludes_links(self):
        path = self.root / "bad.tar"
        with tarfile.open(path, "w") as archive:
            member = tarfile.TarInfo("../../escape"); member.size = 3; archive.addfile(member, io.BytesIO(b"bad"))
        with self.assertRaises(ValueError): extract_archive(path, self.root / "bad", [])
        with tarfile.open(path, "w") as archive:
            member = tarfile.TarInfo("link"); member.type = tarfile.SYMTYPE; member.linkname = "/etc/passwd"; archive.addfile(member)
        warnings = []; self.assertEqual(extract_archive(path, self.root / "safe", warnings), []); self.assertTrue(warnings)
    def test_end_to_end_runner_preserves_original(self):
        import hashlib
        path = self.root / "source.json"; path.write_text(json.dumps([{"platform": "SMS", "timestamp_utc": "2023-11-14T22:13:20Z", "sender_id": "A", "receiver_id": "B", "message_text": "evidence"}]))
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        result = run(path, "json", self.root / "output.jsonl", self.root)
        self.assertEqual(result["messages"], 1); self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        lines = [json.loads(line) for line in (self.root / "output.jsonl").read_text("utf-8").splitlines()]
        self.assertEqual(lines[-1]["type"], "summary")
    def test_schema_fts_tracks_insert_update_delete(self):
        db = sqlite3.connect(":memory:"); db.executescript((ROOT / "src" / "db" / "schema.sql").read_text())
        db.execute("INSERT INTO evidence VALUES('e','file','source','json',0,'s','m','complete','now',NULL)")
        db.execute("INSERT INTO messages VALUES(1,'e',NULL,'SMS','a','b','hello world',NULL,0,'t','l','high')")
        self.assertEqual(db.execute("SELECT count(*) FROM messages_fts WHERE messages_fts MATCH 'hello'").fetchone()[0], 1)
        db.execute("UPDATE messages SET message_text='changed' WHERE id=1")
        self.assertEqual(db.execute("SELECT count(*) FROM messages_fts WHERE messages_fts MATCH 'hello'").fetchone()[0], 0)
        db.execute("DELETE FROM messages WHERE id=1")
        self.assertEqual(db.execute("SELECT count(*) FROM messages_fts WHERE messages_fts MATCH 'changed'").fetchone()[0], 0); db.close()
    def test_timezone_ambiguity_is_not_invented(self):
        self.assertIsNone(utc("2024-01-01T12:00:00"))
        self.assertEqual(utc("2024-01-01T12:00:00+02:00"), "2024-01-01T10:00:00.000Z")

if __name__ == "__main__":
    unittest.main()
