# Controlled Windows and external integration acceptance

This procedure supports real-world acceptance **without** granting a cloud agent unrestricted access to an operator's personal computer. GitHub-hosted CI evidence and operator evidence are different categories.

## Recommended execution model

1. Use an approved **disposable Windows 11/10 test workstation or VM**. No production credentials, real personal records, payment keys, or production datasets. Install approved Node.js 22 and Git; clone the exact reviewed `main` SHA.
2. Run `npm run check`, `npm test`, `npm run accept:export` from a standard non-administrator user account. The exporter saves a local packet in the user's protected AppData HAK acceptance directory and verifies its SHA256. Do not publish the raw packet without operator review.
3. Start with `npm start`, verify `http://127.0.0.1:4317/api/health` on the test host, and confirm it is **not** accessible from a second network machine. Restart and verify an approved disposable Observer event persists using a private `HAK_EVENT_STORE_PATH` and a privately generated `HAK_OBSERVER_TOKEN` (24+ random characters). Never put the token in screenshots, shell transcripts, issue comments or workflow artifacts.
4. Use a **disposable Observer fixture** to perform backup creation, SHA256 verification, and `npm run drill:observer`. Do not overwrite the live store. Record the result, operator, date, OS build, Node version, tested commit SHA, and redacted artifact hash.
5. For each optional provider (Ruflo, Claude-Mem, OmniRoute, Archify, OCR and Orca), enable **only the separately approved integration** on the test host. Run a benign real task, inspect the actual output and trace, and independently review scope isolation, permissions, costs and retention. Connectivity probes and CI mocks are not sufficient.
6. Complete security review and obtain authorized operator/reviewer approval **outside** automated checks. Attach a sanitized evidence index to Issue #32; keep sensitive raw traces in an approved protected evidence store.

## Remote assistance options

**Default (safest): operator-led test.** An authorized Windows operator runs the repository's documented commands locally and shares only sanitized acceptance status and artifact hashes. The cloud assistant can review GitHub logs and those sanitized results; it cannot directly control that computer through this GitHub integration.

**Optional: isolated self-hosted GitHub Actions runner.** Only if an administrator approves: provision a dedicated, ephemeral Windows VM with no production network access, no persistent credentials, and a dedicated runner label. Use a **separate workflow** with explicit `workflow_dispatch`, a trusted protected branch, restrictive GitHub permissions, a job timeout and a manual approval environment. Do not register a runner on a personal or production PC; do not run untrusted PR code on it. Destroy the VM and runner registration after the test. This is not configured automatically in this repository and is not required for operator-led acceptance.

## Evidence acceptance rules

- A CI pass proves only the checked GitHub job passed on its runner for the recorded SHA.
- A SHA256 hash proves byte consistency, not identity or execution authenticity.
- Operator test evidence must include the exact source SHA, tool versions, environment, time, test case, redacted output, reviewer and explicit pass/fail.
- If a required test was not run, record **not-run/pending**. If it failed, record **blocked**. Never turn a pending integration into a passed gate because its HTTP health endpoint responded.
- Final production decision remains **not approved** until the independent evidence and authorized sign-off in [Issue #32](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/issues/32).
