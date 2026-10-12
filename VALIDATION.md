# Validation record and release gates

## Interrupted shared-storage capture repair 0.1.3 — 2026-10-12

A read-only inspection of the reported case found a 39,208,888,320-byte (36.52 GiB) tar capture with 12,158 readable member headers. The last declared file payload extends beyond the captured bytes, the tar terminator is absent, and the remote marker is absent. The archive is genuinely truncated; it remains partial, and no original case, evidence file, or custody entry was changed. The earlier exec-out mode cannot distinguish every early connection end through its host exit code and suppressed remote stderr. The specific historical cable/server/Android cause cannot be established from that capture alone.

On devices advertising shell_v2, acquisition now uses a binary raw adbkit socket with channel framing and a required remote exit packet. Stdout is byte-preserved, stderr remains separate and bounded, and stderr truncation plus remote status are recorded in custody events. Nonzero/missing/malformed completion and remote warnings retain partial evidence. A read-only live CLI control-byte probe also demonstrated that Windows adb shell -T can translate LF to CRLF on this workstation, so that CLI mode is not used for evidence streaming. The binary exec-out marker fallback remains for older devices.

Nine transport regression tests, including the actual adbkit transport against a loopback mock server, cover packet splitting, control bytes, separate bounded stderr, missing/truncated/invalid completion, refusal, cancellation, timeout, and full stdout retention on a denied command. All 35 TypeScript tests and 13 Python tests passed. Native integration additionally verifies shared-storage-only source selection, preservation and hashes of a full rejected source, remote diagnostics in custody, and refusal of an empty source selection. Its synthetic AI endpoint was skipped locally because the real service occupied port 11434. The new UI allows provider deselection for a storage-only retry. A 512 MiB destination reserve is checked during streaming, and stream-stall monitoring ends before disk readback verification. The UI, new custody events, seal manifests, and new cleanup receipts use the package version; earlier records are preserved.

The full desktop workflow passed in development and against the packaged Windows executable. Live native-socket validation could not initially proceed because the authorized phone was no longer present in ADB; reconnection was requested. No new phone content was acquired and the cleanup write path was not exercised. A complete repeat of the historical large archive is still required on a connected device and a destination with adequate space.

## Older application bundle repair — 2026-10-12

An attempted rebuild against the running v0.1.1 directory removed unlocked application files before it failed on a locked `app.asar`. The older parser then failed because `resources/engine/runner.py` was missing. The four unchanged Python modules were restored and SHA-256 checked. The saved v0.1.1 Windows ZIP was verified against its delivery checksum, and all remaining missing application files were restored without replacing any differing existing file. No case or evidence files were modified. The complete desktop import/parse/search/media/verify/PDF workflow passed through the repaired v0.1.1 executable using an isolated synthetic case.

Packaging now uses a versioned output and a wrapper that validates containment, refuses linked targets, and on Windows refuses an output containing a running OpenForensic process. A live isolated v0.1.1 instance confirmed that its folder is refused, a fresh independent output is accepted, escaped names are rejected, and executable/parser files remain present. Runtime code in the v0.1.2 bundle is unchanged by this packaging-only repair.

## Preserve-data sanitization preview 0.1.2 — 2026-10-12

The user requires existing data to remain, so this feature supplies no factory reset, raw erase, or promise of complete permanent deleted-data destruction. It is a separately selected, case-blocked free-space exercise on primary emulated storage. An explicit operator/authority, fresh assessment, typed serial, coverage/backup acknowledgement, and native confirmation are required.

Fourteen new synthetic tests cover temporary-path injection and acquisition-policy rejection, storage units/reserve, power/temperature limits, device identity, confirmation and token replay, existing-file retention, readback failure, cancellation, reconnect cleanup, corrupted checkpoints, ownership refusal, bounded random streaming over non-PTY shell, remote exit rejection, and pre-aborted writes. All 26 TypeScript tests passed. TypeScript checking and production builds passed. The full Electron desktop workflow passed, including the new sidebar page, no-case access, backend refusal while an evidence case is open, closing the case without deleting its database, and the previous import/parser/search/media/verification/PDF flow. Native case/parser/SQLite integration passed locally; synthetic AI endpoints were skipped because real Ollama occupied the port.

Windows packaging passed into a separate `release-v0.1.2` folder because the previous app was running. The same complete desktop workflow passed against that packaged executable, including sanitization sidebar and backend case protection. The unpacked folder must stay together.

These tests use simulated phones and synthetic files. The temporary-write/sanitization path has not been executed on the user's phone. Independent Android hardware validation is required to establish command compatibility, original-file retention, interrupted cleanup, quotas, cache behavior, and thermal/power handling for each supported device/firmware. Temporary-file readback establishes those new bytes only; neither receipts nor completed progress prove earlier deleted contents unrecoverable.

Tests generate synthetic material. They do not acquire an examiner's phone or establish legal admissibility. Rerun the commands in README on each release commit.

## Local validation snapshot — 2026-10-11

### Connection repair preview 0.1.1 — 2026-10-12

The user's Samsung S24 Ultra was visible to Windows but absent from ADB's device list. Restarting the host ADB daemon restored an authorized USB transport. This confirms device detection only; no new content capture or recovery was performed during troubleshooting. The old app did not retain crash diagnostics, so the specific cause of its earlier exit cannot be proved. Inspection found an unhandled adbkit client error path that could terminate Electron, and executable paths set only in a launch terminal could be lost on reopening.

The repair handles forwarded socket errors, shares and bounds scans, starts the daemon using ADB's required local syntax, provides explicit connection recovery, detects standard SDK locations, persists selected tool locations, and retains local diagnostics. Five added regression tests cover late socket errors, missing/failed/hung tools, CLI transport states, and saved settings. Desktop smoke also exercises the system tools panel. Live Ollama status was checked as cloud disabled after the user restarted the service. Model inference was not exercised.

TypeScript checking, the production build, all 12 TypeScript tests, and the complete desktop workflow passed for this repair. Windows packaging passed, followed by the same full workflow against the packaged executable. An additional isolated packaged-app check passed for v0.1.1, automatic ADB location, saving the executable through native IPC, restarting the host daemon, concurrent device scans, and live cloud-disabled Ollama status. Existing evidence and case folders were not modified during troubleshooting. The native SQLite/parser/case integration passed; its synthetic AI endpoint checks were skipped locally because the user's real Ollama service occupied port 11434.

The synthetic desktop workflow explicitly disables ADB discovery so it cannot start a real host daemon or keep the test runner's inherited pipes open during teardown. USB/tool/recovery checks were run separately against the packaged app. CI jobs have a ten-minute limit.

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
