# Validation record and release gates

Tests generate synthetic material. They do not acquire an examiner's phone or establish legal admissibility. Rerun the commands in README on each release commit.

## Local validation snapshot — 2026-10-11

- Windows x64, Node.js 26.7.0, Python 3.14.7, Electron 44.7.0.
- TypeScript checking and production Vite builds passed.
- Seven TypeScript unit tests and thirteen Python engine tests passed.
- Native Electron integration passed, including original/working copy verification, SQLite/FTS5, parser ingestion, duplicate prevention, AI model/citation checks, cloud-mode rejection, report escaping, short raw capture retention, operator cancellation, sealing, reopening, and derivative tampering.
- Actual desktop workflow passed: recorded case creation, verified tar import, parsing, timeline and search, verified image/audio capability URLs, case verification, PDF export, and no renderer errors. Screenshots show generated synthetic records only.
- Windows unpacked packaging passed. The same complete desktop smoke workflow also passed against the packaged OpenForensic.exe, including bundled Python engine resource resolution. Project release signing and real-device acquisition validation remain outstanding.
- Dependency audit reports two high entries for the same unresolved node-forge advisory and its adbkit parent; see SECURITY.md. No real device or actual Ollama model inference was exercised in these synthetic tests.

Automated coverage includes byte-identical streaming, both expected digests, overwrite prevention, partial-file retention, restricted device commands, block-path injection rejection, custody tampering, split completion markers, remote failures, SQLite record decoding, generated freelist recovery, valid/corrupt/uncommitted WAL handling, SMS/WhatsApp/RCS/Messenger normalization, XML entity rejection, Protobuf bounds, archive traversal/link rejection, FTS insert/update/delete consistency, timestamp ambiguity, native SQLite integration, transactional parsing, duplicate prevention, AI provenance/citation persistence, escaped reports, physical short-stream classification, seal/reopen consistency, and derivative tampering.

Before operational use, validate on a documented device matrix with known reference datasets:

1. Authorized stock Android and existing-root/userdebug devices; unauthorized/offline states; missing provider permissions; locked credential-encrypted storage; different vendor shells, `tar`, `dd`, and `blockdev` versions.
2. USB removal, reauthorization, daemon restart, operator cancellation, power interruption, full disk, destination permission failure, and long captures. Compare byte counts and independent reference hashes.
3. Known deleted records with secure_delete on/off, page sizes and encodings, checkpoints, invalid WAL salts/checksums, overflow payloads, vacuuming, encrypted app databases, and unsupported schemas. Measure false positives and coverage; retain parser version and test fixture hashes.
4. Media path resolution, codecs and unsupported formats; Windows/macOS/Linux builds; accessibility; packaged Python/ADB prerequisite checks; signed release installation and uninstallation.
5. Local-only Ollama configuration, model changes, missing models, inference timeout, hostile prompt text, uncited/incorrect citations, omitted context, and examiner correction workflows. Independently review substantive AI claims.
6. Custody event deletion/reordering/modification, original/derivative corruption, checkpoint preservation outside the case, sealed-case reopening, and documented case transfer/retention procedures.

Current exclusions are explicit: no live filesystem snapshot, lock-screen/FBE bypass, encrypted WhatsApp backup decryption, raw-image filesystem mounting, rollback-journal/overflow reconstruction, semantic attribution of unknown Protobuf fields, universal vendor RCS adapter, or device sanitization. Sanitization is a separate requested backlog feature.
