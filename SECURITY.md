# Security and release status

This developer preview handles hostile evidence and must be assessed as a local evidence-processing tool. It is not certified, independently validated, or approved for operational forensic casework.

## Known dependency advisory

As checked on 2026-10-11, the locked dependency graph reports two high-severity entries: `node-forge` and its parent `@devicefarmer/adbkit`. They refer to the same unresolved upstream [RSA signature verification advisory, GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The advisory lists no patched release through node-forge 1.4.0.

OpenForensic uses adbkit for local ADB device inventory. It does not expose adbkit's TCP-to-USB server or use node-forge RSA verification for evidence, custody, or manifests. Native Node crypto computes evidence digests. This narrows the apparent exposed path; it is not a declaration that the dependency is safe. A release review must independently verify reachability, select a reviewed patch/replacement, or document a justified risk decision. Do not suppress the advisory or market this preview as production hardened while that review is unresolved.

`global-agent` is pinned by override to 4.1.3 to avoid the vulnerable older logging dependency tree in packaging tools. The lockfile is checked in. Recheck `npm audit` at each release; dependency status changes over time.

## Controls implemented

- Sandboxed, context-isolated renderer without Node integration; fixed preload methods, top-level sender validation, and runtime IPC schemas.
- Read-command allowlist; no generic device shell or write channel.
- Original file exclusive creation, streaming SHA-256/MD5, durable writes, readback comparison, and partial-source classification.
- Resolved path containment and media extension restrictions; verified working derivatives.
- Bounded Python parser output and execution; archive traversal, links, duplicates, and excessive extraction rejected; XML DTD/entities rejected.
- Parameterized SQLite queries, quoted FTS input, transactional parser ingestion, and source locators.
- Loopback AI only with cloud-disabled preflight, remote model rejection, bounded retrieval, no model tools, recorded provenance, and source citation checks.
- Report HTML escaping, restrictive CSP, and sandboxed PDF rendering.

## Remaining boundaries

Read-only file attributes and event hash chains cannot defend against an administrator who controls the case and all local checkpoints. Store case data on an encrypted examiner volume and preserve the manifest digest independently. Python is a separate process but is not an OS sandbox; a validated isolated analysis environment is advisable for highly adversarial evidence. The app does not implement database encryption, role-based examiner authentication, signed manifests backed by hardware keys, or enterprise custody transfer acknowledgements.

Live-device acquisition is not hardware write blocked and is not an atomic snapshot. No claim of admissibility, completeness, authorship, or guaranteed deletion recovery is made. AI drafts can be wrong despite syntactically valid citations.

Report vulnerabilities privately to the repository maintainer through GitHub's private vulnerability reporting when enabled. Do not attach actual evidence, personal data, or confidential case material to public issues.
