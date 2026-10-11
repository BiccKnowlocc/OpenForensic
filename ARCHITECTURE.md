# OpenForensic architecture

OpenForensic is a local examiner app for authorized Android acquisition. It runs on the examiner's machine, talks to the phone only over a user-authorized adb session (or an already-rooted phone the operator controls), and keeps case evidence on that machine.

## Boundaries

- Acquisition only after the phone user has authorized USB debugging, or the phone is already rooted and in the operator's control.
- No exploit root, no lock-screen or file-based encryption bypass, and no covert implant.
- Deleted data means SQLite freelist and WAL records, plus unallocated carving only on an image already acquired under that model. A full dump of every deleted byte from a locked encrypted phone is out of scope.
- The case database is local SQLite with FTS5. MongoDB is not part of this design unless the user later overrides it.

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron |
| UI | React, Tailwind |
| Bundler | Vite |
| Device I/O | Node `adbkit` plus `child_process` streams |
| Hashes | Node `crypto` Transform (MD5 and SHA-256) while bytes are written to disk |
| Parsers | Python 3 |
| Case database | Local SQLite FTS5 (`case_store.db`) |

## Pipeline

Extraction, parsing, and UI stay separate. The phone path is read-only. Hashes are computed on the write stream. The audit log is append-only JSON.

```mermaid
flowchart TD
  phone["Phone: USB debugging authorized by the user, or already rooted and in operator control"]
  adb["src/main adb client: detect, fingerprint, heartbeat"]
  logical["Logical extract: SMS, call log, contacts, shared media"]
  physical["Physical block stream: only if su already works"]
  hash["hashStream: MD5 + SHA-256 Transform while writing"]
  casebox["Case folder: raw files, evidence_manifest.json, immutable audit log"]
  engine["src/engine: parser bridge, telephony parsers, SQLite WAL and freelist carver"]
  db["src/db: case_store.db SQLite FTS5"]
  ui["src/renderer: ExtractionMonitor, TimelineView, ChatViewer"]
  stop["Stop and record the error. No bypass."]

  phone -->|"read-only adb"| adb
  adb --> logical
  adb -.->|"later, su already present"| physical
  logical --> hash
  physical --> hash
  hash --> casebox
  casebox --> engine
  engine --> db
  db --> ui
  adb -->|"USB loss, permission denial, or encrypted partition"| stop
  logical --> stop
  physical --> stop
```

## Directory map

This is the planned tree. It is not a second task list. `physical.ts` and the carver are later work; they sit in the tree so the v1 scaffold has a place to grow.

```text
.cursorrules
TODO.md
ARCHITECTURE.md
package.json
src/main
  index.ts
  adb/client.ts
  logical.ts
  physical.ts
  integrity/hashStream.ts
  manifest.ts
src/engine
  parser_bridge.ts
  carver_sqlite.py
  parse_telephony.py
  schemas.py
src/db
  index.ts
  schema.sql
  queries.ts
src/renderer
  App.tsx
  ExtractionMonitor
  TimelineView
  ChatViewer
  caseStore
```

## Chain of custody

- The adb client does not write to the phone. Content queries and file pulls are reads.
- `integrity/hashStream.ts` hashes each byte stream with MD5 and SHA-256 in a Transform as the file is written. Hashes are stored in `evidence_manifest.json`, not computed from a second read after the fact.
- `evidence_manifest.json` records device ids, timestamps, operator, source paths, and hashes.
- The audit log is immutable JSON: each event is appended. The UI does not rewrite earlier lines.
- Case folders support create, open, and archive. Archive does not delete the manifest or the log.

## Modules

- `src/main` owns the Electron process, adb, logical extract, the later physical stream, hashing, and the manifest.
- `src/engine` owns parsing. Node calls Python through `parser_bridge.ts`. Parsers for telephony, WhatsApp, and Messenger run only when that database and its key are already in the acquisition. There is no crypt breaker.
- `src/db` owns `case_store.db`. Normalized message rows use `timestamp_utc`, `platform`, `sender_id`, `receiver_id`, `message_text`, `media_path`, and `is_deleted_flag`, with an FTS5 index for search.
- `src/renderer` owns the live extraction monitor, the timeline, and the chat thread viewer. It reads the case store. It does not talk to adb.

## Failure handling

USB disconnect, permission denial, and encrypted partitions stop the operation and append an error to the audit log.

- Heartbeat: if the USB device disappears, extraction stops and the partial files already hashed stay in the case folder with the error recorded.
- Permission denial: if an adb content query or pull is rejected, that source is marked failed. The app does not retry through another privilege path.
- Encrypted partition: if a read hits file-based encryption or another locked volume, the stream stops. The error is recorded. There is no lock-screen bypass and no encryption bypass.

## Deployment

USB acquisition cannot run on Netlify. The examiner machine is the only place adb, the case folder, and `case_store.db` exist.

Netlify can host a documentation or landing site later. That site does not receive evidence, manifests, or audit logs.

MongoDB Atlas is not used. The case database stays in local SQLite unless the user later overrides that choice.
