# Evidence-based acceptance plan

## Release scope and hard gates
Release acceptance is scoped: `core`, `orca-desktop`, `orca-mobile`, and each provider are independently gated. A passing CI run is not a production approval. Any optional integration lacking real evidence must remain disabled. Never fabricate host/provider evidence.

## Evidence manifest
For each gate record: gate ID, test name, timestamp (UTC), repository commit SHA, OS/runtime and tool version, result (pass/fail/not-run), evidence artifact identifier and SHA256, operator/reviewer, and limitations. Redact tokens, pairing codes, personal data, local paths and raw prompts before sharing. A SHA256 proves file integrity only, not authorship.

## Core: CI and operator Windows
- GitHub Actions: all required Node 22 jobs on Ubuntu and Windows pass for the exact head SHA.
- Approved Windows host: run `npm run accept:local`, `npm run accept:export`, `npm run accept:verify -- "<packet-path>"`; check dashboard startup, loopback-only network binding, authentication and restart replay.
- Isolated backup drill: `npm run backup:observer -- create ...`, `verify` and `npm run drill:observer -- ...` against disposable approved test data. Record evidence. Do not modify production data.
- Independently inspect RBAC, secret handling, failure behavior, dependency/license risk, recovery and audit trails. Block core release for unresolved critical security defects.

## Orca desktop and mobile
- Windows desktop: verify installed Orca version and registered CLI, then `npm run accept:orca`. This is a read-only connectivity test, not proof of agent execution.
- Pair Android/iOS using the official Orca app and one-time pairing flow. Never record pairing codes or device tokens.
- With a disposable workspace, verify mobile can read agent state, respond to a benign prompt, observe the corresponding desktop event, disconnect and reconnect.
- Record the result and independently confirm HAK policy, audit and GitHub CI still control any HAK actions. Orca's own mobile controls do not automatically inherit HAK authorization.
- Do not mark Orca mobile as passed based on Windows-hosted GitHub CI or CLI mocks.

## Optional integrations: independent gates
- OmniRoute: operator-approved real low-risk request and verified response, with cost cap and no secret logging.
- Ruflo: real delegated benign task with agent trace, result and policy decision.
- Claude-Mem: scope-isolation, persistence and restart retrieval using non-sensitive fixtures.
- Archify: diagram export from a test repository with verifiable source links.
- OCR: run the actual OCR engine on a representative labeled test set, then score outputs with `npm run accept:ocr`; text-only scoring is not engine acceptance.
- A health probe alone never passes an integration.

## Decision
A gate is `passed` only with valid independent evidence and authorized human sign-off; `blocked` when mandatory tests fail; otherwise `pending`. Core may be accepted separately with all unverified integrations disabled. The complete integrated system is accepted only when every required gate is passed. Record final decision in Issue #32 with evidence references, never secrets.
