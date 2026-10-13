# Case bundle viewer reference

The primary forensic desktop is built from the repository root. The retained case-bundle desktop uses `npm run dev:viewer-desktop`; the web viewer uses `npm run dev:web`. The viewer case bundle and workstation evidence schemas are separate.

# OpenForensic

Examiner workstation for an authorized Android logical acquisition, plus a web case viewer. The phone or tablet user has turned on USB debugging and accepted the prompt. The test device is not rooted.

OpenForensic does not exploit a device, bypass a lock screen or encryption, or install a hidden agent. v1 reads SMS, call log, contacts, and shared media. A separate, confirmed action can fill free space on shared storage with junk files. It does not image block devices.

## v1 layout

- Desktop app: Electron, React, Vite, and Tailwind in `src/main`, `src/renderer`, `src/engine`, and `src/db`.
- Web viewer: `web/`, deployed for Netlify. Dev server binds `0.0.0.0:41773`.
- Sample case: Harbor Street, labeled sample, so timeline, chat, and review work with no phone.
- Local case folder: streaming MD5 and SHA-256, `evidence_manifest.json`, append-only `audit.jsonl`, and `case_store.db` (SQLite FTS5).
- Atlas project and cluster name OpenForensic, database `OpenForensic`. The connection string lives only in the host environment. See `.env.example`.

## Run the web viewer

```bash
npm install
npm run dev:web
```

Open http://127.0.0.1:41773/ and open the Harbor Street sample.

## Run the desktop app

Install Node.js 22 and Android platform-tools so `adb` is on `PATH`.

```bash
npm install
npm run dev:viewer-desktop
```

Create a case, connect a phone whose user authorized USB debugging, then start a logical extraction. Hashes are computed while files are written. USB disconnect, permission denial, and encrypted storage stop the read and append an error to the audit log.

## Free-space wipe

From a real case in the desktop app, Monitor → Fill free space. Type `WIPE`. The app writes junk files only to `/sdcard/OpenForensic/free-space-wipe` until about 128 MB remains free, then you can remove those files. It stops if the USB device disappears, the shell is denied, or the storage is encrypted. It does not unlock the phone.

## Review

Ask about the open case, summarize a thread, explain the timeline, or draft a short report. The deployed viewer calls the Netlify AI Gateway with `gpt-4o-mini`. If the gateway is not reachable, the app uses a labeled local review of the same case records.

## Netlify

Build command `npm run build:web`, publish directory `web/dist`, Node 22. Set `MONGODB_URI` in the site environment. Do not set `OPENAI_API_KEY`. Enable AI features so the gateway can inject its own endpoint.

```bash
npx netlify login
npx netlify link --git-remote-url https://github.com/BiccKnowlocc/OpenForensic
```

## Tests

```bash
npm test
```
