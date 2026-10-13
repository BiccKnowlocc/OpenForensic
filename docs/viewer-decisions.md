# Case bundle viewer reference

The primary forensic desktop is built from the repository root. The retained case-bundle desktop uses `npm run dev:viewer-desktop`; the web viewer uses `npm run dev:web`. The viewer case bundle and workstation evidence schemas are separate.

# Scope questions

Locked 2026-10-11.

1. Examiner computer: Windows, macOS, and Linux.
2. Test phone: Android, USB debugging on, not rooted. v1 acquisition is logical only.
3. GitHub: https://github.com/BiccKnowlocc/OpenForensic
4. Netlify: web case viewer in v1.
5. Database: local case folder and `case_store.db` on the examiner machine. The viewer and review also read MongoDB Atlas project OpenForensic, cluster OpenForensic.
6. v1: SMS, calls, contacts, shared media, hashes, timeline, and chat view. Yes. Review of records already in the case is included. A confirmed free-space wipe is a separate action on an authorized phone or tablet.
