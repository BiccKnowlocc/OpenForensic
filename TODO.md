# OpenForensic tasks

Implementation checklist for a local examiner workstation. Checked items have code in the developer preview; operational validation remains a separate release gate.

## Boundaries

- Acquisition only after the phone user has authorized USB debugging, or the phone is already rooted and in the operator's control.
- No exploit root, no lock-screen/FBE bypass, no covert implant.
- Deleted data means SQLite freelist/WAL (and unallocated carving only on an image already acquired under that model). A full dump of every deleted byte from a locked encrypted phone is out of scope.
- Evidence stays in local SQLite (FTS5). No MongoDB unless the user later overrides.

## Now

- [x] Save this task list
- [x] Create a public GitHub repo named OpenForensic
- [ ] Confirm Netlify is docs-only later
- [x] Keep the case database local

## v1

- [x] Electron + React + Vite + Tailwind scaffold
- [x] Directories `src/main`, `src/renderer`, `src/engine`, `src/db`
- [x] adb device detect and fingerprint (`getprop`, root check, SELinux)
- [x] Heartbeat for USB disconnect
- [x] Streaming MD5 and SHA-256 Transform while writing to disk, plus disk readback verification
- [x] Logical extract of SMS/MMS, call log, contacts, and optional full shared storage via authorized read commands
- [x] `evidence_manifest.json` (device ids, timestamps, operator, source paths, hashes)
- [x] Hash-chained append-only application audit log and explicit external checkpoint limitations
- [x] Case folder create, open, and seal
- [ ] Dedicated archive/transfer workflow with receipts and retention controls
- [x] `case_store.db` normalized message fields and FTS5
- [x] Live extraction monitor
- [x] Timeline
- [x] Chat thread viewer and acquired media/audio playback
- [x] Local-only AI questions, thread summaries, cited report drafts, and retained provenance

## Later

- [ ] Optional user-installed helper for data content providers do not expose (visible install, not a covert agent)
- [x] Physical block stream with existing `su` or root-shell access, completion status and expected byte count
- [x] SQLite active tables, checksum-validated WAL, freelist and intact unallocated record-header inspection
- [x] Plaintext telephony, supported WhatsApp schemas, Messenger exports, and explicit RCS export normalization
- [x] Protobuf wire decoding and SharedPreferences XML
- [x] HTML and PDF report export
- [ ] Independent real-device validation and false-positive/coverage measurements
- [ ] Resolve or independently assess upstream adbkit/node-forge advisory before operational release
- [ ] Signed release installers and cross-platform packaging validation
- [ ] Dedicated adapters for vendor-private RCS schemas and additional application versions
- [ ] Validated filesystem analysis of already acquired raw images and overflow/rollback-journal reconstruction

## Requested follow-up: device sanitization

- [ ] Design a separate, explicitly destructive sanitization workflow for operator-owned or otherwise authorized phones and tablets, outside evidence acquisition and active case examination.
- [ ] Evaluate free-space filling with junk files against platform-supported cryptographic erase and reset procedures. Document flash wear leveling, encryption, TRIM, reserved storage, and verification limits before selecting a method.
- [ ] Define supported platforms, scope, power-loss behavior, operator confirmation, audit receipt, and independent validation. Never claim guaranteed deleted-data destruction from free-space filling alone.
- [ ] Build only after the current acquisition, parsing, triage, and AI work is completed. This request is backlog scope; no device sanitization is implemented in the acquisition command policy.
