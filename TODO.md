# OpenForensic tasks

Planning checklist for a local examiner workstation. Nothing here is started until the box is checked.

## Boundaries

- Acquisition only after the phone user has authorized USB debugging, or the phone is already rooted and in the operator's control.
- No exploit root, no lock-screen/FBE bypass, no covert implant.
- Deleted data means SQLite freelist/WAL (and unallocated carving only on an image already acquired under that model). A full dump of every deleted byte from a locked encrypted phone is out of scope.
- Evidence stays in local SQLite (FTS5). No MongoDB unless the user later overrides.

## Now

- [x] Save this task list
- [x] Create a public GitHub repo named OpenForensic
- [ ] Confirm Netlify is docs-only later
- [ ] Keep the case database local

## v1

- [ ] Electron + React + Vite + Tailwind scaffold
- [ ] Directories `src/main`, `src/renderer`, `src/engine`, `src/db`
- [ ] adb device detect and fingerprint (`getprop`, root check, SELinux)
- [ ] Heartbeat for USB disconnect
- [ ] Streaming MD5 and SHA-256 Transform while writing to disk
- [ ] Logical extract of SMS, call log, contacts, and shared media (`/sdcard/DCIM`, `Download`, `Recordings`) via authorized adb content queries
- [ ] `evidence_manifest.json` (device ids, timestamps, operator, source paths, hashes)
- [ ] Immutable JSON audit log
- [ ] Case folder create, open, and archive
- [ ] `case_store.db` with normalized message fields (`timestamp_utc`, `platform`, `sender_id`, `receiver_id`, `message_text`, `media_path`, `is_deleted_flag`) and FTS5
- [ ] Live extraction monitor
- [ ] Timeline
- [ ] Chat thread viewer

## Later

- [ ] Optional user-installed helper for data content providers do not expose (visible install, not a covert agent)
- [ ] Physical block stream only when `su` already works
- [ ] SQLite active tables, WAL, and freelist carver
- [ ] Telephony, WhatsApp, and Messenger parsers where the database and key are already in the acquisition (do not build a crypt breaker)
- [ ] Protobuf and XML
- [ ] HTML and PDF report export
