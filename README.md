# OpenForensic

An open-source, local Android evidence acquisition and communications examination desktop application. Electron owns device access and case storage; a sandboxed React interface provides acquisition monitoring, searchable conversations, candidate recovery inspection, local AI assistance, and report export.

**Release status: executable developer preview, 0.1.2.** The build includes acquisition, integrity, parsing, UI, AI, and a separate best-effort shared-storage cleanup workflow. It is not a validated replacement for a commercial forensic suite. Real-device validation, independent examiner review, signed installers, and the unresolved upstream dependency advisory described in [SECURITY.md](SECURITY.md) are release gates before operational casework.

## Run

Install Node.js 22.12 or newer, Python 3.11 or newer, and [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools). Put `adb` and `python` on PATH. Windows may require the device manufacturer's USB driver. The project uses the maintained `@devicefarmer/adbkit` fork of adbkit.

```powershell
npm ci
npm run dev
```

Use **Check system tools → Choose ADB executable / Choose Python executable** to save executable locations across launches. The device bridge also detects standard Android SDK locations and `C:\Android\platform-tools\adb.exe`. Environment overrides remain available for managed installations:

```powershell
$env:OPENFORENSIC_ADB = 'C:\Android\platform-tools\adb.exe'
$env:OPENFORENSIC_PYTHON = 'C:\Python314\python.exe'
npm run dev
```

The Python engine uses only the standard library. No Python package installation is required. Python and platform tools remain host prerequisites in packaged distributions; the engine's `.py` files are bundled.

```powershell
npm run build
npm run package
npm run dist
```

`package` produces an unpacked desktop application; `dist` produces the platform installer. macOS signing/notarization and Windows signing require operator-provided release credentials. Run platform packaging on the corresponding platform.

The packaging wrapper writes to `release-v<version>` by default; for this version the Windows executable is `release-v0.1.2/win-unpacked/OpenForensic.exe`. Keep the entire `win-unpacked` folder together, including `resources/engine`. Windows packaging refuses to replace a target folder with a running OpenForensic process. Existing output folders are refused on other platforms; choose another release folder. Use `node scripts/package.mjs --check` for a read-only preflight, or `npm run package -- --output-name=release-v0.1.2-build2` for a separate output. Do not invoke electron-builder directly against a running app. The build uses the Electron distribution already installed in `node_modules/electron/dist`, which avoids a second download and archive staging rename. Host Python and Android platform tools are still required for their corresponding functions.

## Connection troubleshooting

Open **Check system tools** to see the executable paths, live device states, and Ollama cloud status. ADB errors remain visible instead of appearing as an empty device list. **Recover connection** restarts the local ADB service; it is unavailable during acquisition/processing and interrupts other programs' ADB sessions. Unlock the phone and accept its USB debugging prompt. An unauthorized phone requires that prompt; an empty list can also indicate a cable or driver problem. Device scanning is bounded and shared between callers, and socket errors are handled without terminating the app.

**Open diagnostic records** opens local application error logs. Native crash reports are saved locally with upload disabled. These files can contain paths and device identifiers; review them before sharing. Original case evidence is kept in the chosen case folders, separate from tool settings and diagnostics. Reopen and verify any case that was active during an unexpected exit; an interrupted acquisition is not a complete capture.

## Examination workflow

1. Create a case, recording its name, examiner, collection authority, and scope. Select a parent directory; the application creates a unique case folder.
2. Connect an Android device with USB debugging already enabled and this host authorized. TCP/emulator serials are excluded from the device list. Inspect the device to record properties, root access, SELinux, and approximate clock offset. Root probes can trigger device prompts and logs.
3. Acknowledge live acquisition effects. Logical capture queries SMS, MMS, calls, and contacts independently. Shared storage is optionally archived; existing root permits WhatsApp/telephony app database archives. Permission failures remain preserved as failed/partial sources.
4. Physical capture reads an inventoried block device with existing `su` access or an already-root shell. It requires a valid block size and sufficient free space. It never runs `adb root`, roots a phone, disables SELinux, unlocks a screen, or bypasses encryption.
5. Alternatively, import plaintext SQLite databases, Messenger JSON exports, normalized message exports, XML, Protobuf wire files, or tar archives. Database `-wal` and `-shm` companions are automatically imported when present. Import a database and its WAL from the same acquisition, not unrelated live snapshots.
6. Select **Parse & carve** in the evidence register. Parsing occurs in a verified working copy. Examine live communications in Conversations and raw candidates in Recovered candidates. Re-parsing does not duplicate normalized records.
7. Verify the case and export an examiner report as HTML or PDF. Optionally use the local AI assistant. Seal after all intended analysis; a sealed case supports verification and report export, while new acquisition, parsing, and AI runs are blocked.

## Device sanitization while retaining existing files

**Device sanitization** sits below **Integrity & custody**. This release provides a best-effort free-space exercise for an authorized, unlocked Android USB device. It is not a guaranteed permanent deleted-data wipe, a factory reset, or a NIST clear/purge certificate. [NIST SP 800-88 Rev. 2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf) explains why flash remapping and spare cells prevent ordinary overwrite interfaces from reaching all previous contents. Current user files cannot be retained while honestly promising complete destruction of every deleted copy by this method.

Close the evidence case first. Select the device and a temporary-write limit, assess storage and power, record the operator/authority, type the device serial, acknowledge backup and coverage limits, and confirm the native dialog. Begin with a small limit when validating a device model. At least 2 GiB or 5% of total storage remains available, plus a transfer margin. The phone must be powered, at least 30% charged, and cooler than 42°C. The absolute run cap is 512 GiB.

The separate transport creates an exclusive job directory on primary emulated shared storage and streams random bytes into 64 MiB files with exclusive creation and fsync. Each file is verified by size and SHA-256 readback before counting it as verified. Existing files are not selected for deletion. The directory carries a job ownership marker; cleanup validates canonical paths, rejects symlinks, removes only recorded temporary file names, and removes the directory only when empty apart from that marker. There is no recursive delete, raw-device write, root request, reset, or arbitrary write command API.

Stop requests remove the temporary files. USB loss retains a durable checkpoint and a reconnect cleanup action for the same identified device. Operation receipts and hash-chained logs live outside case folders and can be exported as JSON with a SHA-256 companion. They verify recorded activity and temporary-file readback, not destruction of previous deleted contents. Private app databases/WALs, reserved/remapped flash, SD cards, cloud backups, and copies on other devices are excluded. Android may independently clear caches or modify its data under storage pressure; keep a current backup.

## AI assistance

Install [Ollama](https://ollama.com/download) and download a local text model appropriate to the workstation's RAM/VRAM. Start Ollama with cloud features disabled. For a manually started service on Windows:

```powershell
$env:OLLAMA_NO_CLOUD = '1'
ollama serve
```

If the Ollama desktop background service is already running, change its configuration and restart it as described in the [official local-only instructions](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features). Refresh system tools in OpenForensic after installing a model.

OpenForensic calls only `http://127.0.0.1:11434`, rejects redirects, rejects remote/cloud model metadata, and requires `/api/status` to confirm that cloud features are disabled before sending evidence. An older Ollama that cannot confirm this status is refused. The trusted local service remains part of the examiner's security boundary.

- Questions use bounded lexical FTS5 retrieval; they are not semantic searches over the entire case.
- Thread summaries and report drafts use up to 300 chronological records and a 22,000-character source budget. Context limits are displayed and retained.
- Every accepted draft must include `[M:id]` citations drawn from its supplied records. Invalid IDs or missing citations reject the draft. Citation validation does not establish factual correctness.
- Model name and digest, metadata, prompt, source IDs, source snapshot digest, response, time, and truncation status are stored. AI has no device commands or other tools and cannot change original evidence.
- Deleted-record candidates are intentionally excluded from AI communications analysis pending examiner interpretation.

## Recovery coverage and limits

The Python carver uses SQLite's on-disk record format. It follows freelist trunk links, inspects retained table-leaf cells, and heuristically scans intact record headers in freelist fragments, unallocated regions, and freeblocks. It also validates WAL headers, salts, and rolling checksums and distinguishes committed from uncommitted frames. Candidate byte offsets, row IDs where available, decoded values, confidence, and raw hex are retained.

An intact cell on a freelist page suggests deallocation. It does not establish its original table, owner, deletion time, or legal meaning. A WAL record is a page version and may remain in the current database. Heuristic fragments can be false positives. Overwritten record headers, overflow chains, fragmented filesystems, rollback journals, SQLCipher databases, and encrypted WhatsApp backup formats are not reconstructed by this release.

Supported live adapters: Android SMS and MMS SQLite tables; older WhatsApp `messages` and newer `message/chat/jid` schemas; Messenger account JSON exports; an explicit `rcs_messages` export contract with Unix millisecond timestamps; normalized JSON message arrays. Vendor-private RCS schemas require a dedicated adapter. SharedPreferences values and schema-free Protobuf fields are retained as auxiliary artifacts, without inventing semantic field names. Provider text output is ambiguous and is assigned low confidence.

Raw physical images are acquired and verified but are not automatically mounted, decrypted, or converted into application databases. [Android file-based encryption](https://source.android.com/docs/security/features/encryption/file-based), TRIM, secure deletion, and application cleanup can make deleted data inaccessible. No universal deleted-data recovery claim is made.

## Integrity and custody

`src/main/integrity/hashStream.ts` uses native Node crypto accumulators in a Transform stream. Backpressure governs disk writes. Memory usage is independent of acquisition length. Both SHA-256 and MD5 are computed on incoming payload bytes; the saved file is reread and compared. MD5 provides legacy compatibility; SHA-256 is the primary integrity digest.

Remote command completion uses a randomized protocol trailer that is removed before hashing. Missing or nonzero completion status fails the source, even when the host ADB command exits successfully. Raw physical captures also require the expected byte count. Cancellation, USB loss, denial, and short streams retain hashed partial files with explicit status and incidents.

The application enforces a typed command allowlist. **Live Android acquisition does not provide hardware write blocking:** Android services, content providers, access accounting, and `su` can change device state or logs independently of these read commands. App archives are live, non-atomic captures; clock offsets are approximate and never silently applied to timestamps.

Custody events are canonical JSONL chained with SHA-256 and flushed to disk. Sealing creates `evidence_manifest.json` with case details, device profiles, hardware properties, UTC timestamps, evidence digests, runtime versions, audit head, and case database digest. Evidence and parser derivatives are independently verified. Exclusive creation and read-only file attributes protect against accidental rewrites; they do not prevent an administrator from replacing files. Preserve the manifest digest and audit head in independently controlled storage. Hashes establish byte consistency, not provenance, authorship, or truth.

Case folders contain:

```text
case_store.db                 Normalized records, FTS5, parser/AI runs, evidence register
audit.jsonl                   Hash-chained custody and examination events
evidence/                     Original acquired/imported bytes, including partial captures
sessions/                     Device acquisition profiles
working/                      Verified copies and safely unpacked archive artifacts
derivatives/                  Parser JSONL outputs
reports/                      Examiner-selected report exports
evidence_manifest.json        Created once when the case is sealed
evidence_manifest.sha256      Preserve independently as the seal checkpoint
```

Use an encrypted examiner volume and an appropriate access-control/backup policy for sensitive evidence. The database itself is SQLite, not SQLCipher. Sealing currently freezes the examination case; continued work should use a new case with documented verified imports.

## Implementation files

```text
package.json                  Dependencies, scripts, desktop packaging
package-lock.json             Reproducible dependency resolution
electron.vite.config.ts        Main/preload/React Vite builds
tsconfig.json                 Strict TypeScript configuration
vitest.config.ts              Unit test configuration
src/shared/types.ts           Validated desktop API data contracts
src/main/index.ts             Secure Electron protocols, IPC, dialogs, media, PDF export
src/preload/index.ts          Narrow context-isolated renderer API
src/main/adb/client.ts        adbkit inventory and bounded ADB subprocess handling
src/main/adb/policy.ts        Read command and block-path allowlist
src/main/adb/remoteStatus.ts  Binary-safe remote exit-status trailer handling
src/main/acquisition.ts      Logical/physical capture, heartbeat, import, partial retention
src/main/case.ts             Case lifecycle, verification, manifest sealing
src/main/integrity/hashStream.ts  Streaming SHA-256/MD5 and durable writes
src/main/integrity/audit.ts   Canonical custody event hash chain
src/main/ai.ts               Local-only retrieval, inference, citations, provenance
src/main/sanitization/policy.ts  Generated temporary paths and storage/power limits
src/main/sanitization/transport.ts  Binary random streaming and ownership-checked cleanup
src/main/sanitization/service.ts  Confirmation plans, checkpoints, recovery, audit receipts
src/main/report.ts           Escaped, source-linked examiner HTML report
src/db/schema.sql            Evidence, communications, FTS5, recovery, derivative, AI tables
src/db/index.ts              SQLite storage and parameterized queries
src/engine/parser_bridge.ts  Verified working copies, worker lifecycle, validated ingestion
src/engine/runner.py         Safe archive handling and bounded artifact dispatch
src/engine/carver_sqlite.py  SQLite records, freelist/unallocated inspection, validated WAL
src/engine/normalizers.py    SMS/MMS/WhatsApp/RCS/Messenger/export normalization
src/engine/formats.py        SharedPreferences XML and Protobuf wire decoding
src/renderer/index.html      Restrictive content security policy
src/renderer/main.tsx        React entry point
src/renderer/App.tsx         Acquisition, conversation, recovery, AI, and custody dashboard
src/renderer/Sanitization.tsx  Separate preserve-data cleanup dashboard
src/renderer/styles.css      Tailwind import and desktop visual design
tests/hashStream.test.ts     Durable streaming and interruption tests
tests/policy.test.ts         Device policy, custody tampering, and path boundary tests
tests/remoteStatus.test.ts   Split trailers and remote failure tests
tests/python/test_engine.py  Generated SQLite/WAL/format/archive/FTS fixtures
tests/integration.ts         Native Electron SQLite + engine + case lifecycle integration
scripts/run-integration.mjs  Native-runtime test bundling and launcher
scripts/desktop-smoke.mjs    Actual Electron workflow and PDF export validation
scripts/build-icon.py        Optional icon regeneration with Pillow
build/icon.svg              Application vector identity
build/icon.png              Checked-in cross-platform icon
build/icon.ico              Checked-in Windows icon
```

## Validation

```powershell
npm run typecheck
npm test
npm run test:python
npm run test:integration
npm run test:desktop
npm run build
npm audit
```

The integration suite runs under Electron's Node runtime to match the `better-sqlite3` native ABI. Its AI endpoint is a synthetic local service; if port 11434 is occupied, it skips that endpoint check and sends no data to the existing service. Tests use generated synthetic evidence and never require a connected device. See [VALIDATION.md](VALIDATION.md) for release validation and [TODO.md](TODO.md) for outstanding work, including the separately requested device sanitization feature.

Desktop screenshots are optional: set `OPENFORENSIC_SCREENSHOTS=1` when running `test:desktop` to capture the synthetic preview. Default CI validates the functional UI and PDF workflow without depending on hidden-window compositor capture.
