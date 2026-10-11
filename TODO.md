# OpenForensic tasks

## Boundaries

- Acquisition only after the phone user has authorized USB debugging. The v1 test phone is not rooted.
- No exploit root, no lock-screen or encryption bypass, and no covert implant.
- Deleted-message carving stays out of v1. A free-space wipe can overwrite deleted files the shell can already write on shared storage. It is a separate confirmed action, not part of extraction.
- The examiner machine keeps the case folder, hashes, manifest, audit log, and `case_store.db`. The web viewer and review read MongoDB Atlas when `MONGODB_URI` is set.

## Now

- [x] Save this task list
- [x] Create a public GitHub repo named OpenForensic
- [x] Web case viewer is in v1 and is the Netlify site
- [x] Viewer and review read Atlas project OpenForensic, cluster OpenForensic, database OpenForensic, when the host has `MONGODB_URI`

## v1

- [x] Electron + React + Vite + Tailwind scaffold
- [x] Directories `src/main`, `src/renderer`, `src/engine`, `src/db`
- [x] adb device detect and fingerprint (`getprop`, root check via `id`, SELinux)
- [x] Heartbeat for USB disconnect
- [x] Streaming MD5 and SHA-256 Transform while writing to disk
- [x] Logical extract of SMS, call log, contacts, and shared media (`/sdcard/DCIM`, `Download`, `Recordings`) via authorized adb content queries
- [x] `evidence_manifest.json` (device ids, timestamps, operator, source paths, hashes)
- [x] Immutable JSON audit log
- [x] Case folder create, open, and archive
- [x] `case_store.db` with normalized message fields (`timestamp_utc`, `platform`, `sender_id`, `receiver_id`, `message_text`, `media_path`, `is_deleted_flag`) and FTS5
- [x] Live extraction monitor
- [x] Timeline
- [x] Chat thread viewer
- [x] Harbor Street sample case for the viewer, timeline, chat, and review with no phone attached
- [x] Review on records already in the case: ask, summarize a thread, explain the timeline, draft a short report. Netlify AI Gateway model `gpt-4o-mini`, with a labeled local fallback
- [x] Free-space wipe for an authorized Android phone or tablet: junk files only in `/sdcard/OpenForensic/free-space-wipe`, stop with about 128 MB free, confirmation required, remove-files action, stop on USB loss, permission denial, or encrypted storage

## Later

- [ ] Optional user-installed helper for data content providers do not expose (visible install, not a covert agent)
- [ ] Physical block stream only when `su` already works
- [ ] SQLite active tables, WAL, and freelist carver
- [ ] Telephony, WhatsApp, and Messenger parsers where the database and key are already in the acquisition (do not build a crypt breaker)
- [ ] Protobuf and XML
- [ ] HTML and PDF report export
