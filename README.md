# OpenForensic

Local examiner workstation for authorized Android acquisition. The phone user has authorized USB debugging, or the phone is already rooted and in the operator's control.

OpenForensic does not exploit a device, bypass a lock screen or file-based encryption, or install a hidden agent. Deleted-message work is limited to SQLite freelist and WAL data on an image already acquired under that model.

This repository currently holds the task list and the architecture. The Electron app is not scaffolded yet.

## Planned stack

- Electron, React, Tailwind, and Vite
- Node `adbkit` and `child_process` streams for authorized adb
- Node `crypto` Transform hashes (MD5 and SHA-256) while files are written
- Python 3 parsers
- Local SQLite with FTS5 (`case_store.db` on the examiner machine)

## How it will run

Acquisition runs on the examiner's computer, not on Netlify.

1. Install Node.js, Python 3, and Android platform-tools so `adb` is on `PATH`.
2. Install dependencies and start the app once the v1 scaffold exists: `npm install`, then `npm run dev`.
3. Connect a phone whose user has authorized USB debugging, or a phone that is already rooted and in your control.
4. Create or open a case folder. Raw extracts, `evidence_manifest.json`, the audit log, and `case_store.db` stay on this machine.

See [TODO.md](TODO.md) for the checklist and [ARCHITECTURE.md](ARCHITECTURE.md) for the pipeline.

## What stays off this machine's cloud accounts

- Netlify, if used later, hosts a docs or landing page only. It cannot run USB acquisition.
- The case database is local SQLite. MongoDB is not part of the design unless that choice is explicitly changed later.
