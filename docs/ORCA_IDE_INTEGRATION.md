# Orca IDE integration boundary (proposal; not production-certified)

## Ownership and trust boundaries

HAK_AI_AGENT_CONTROL_CENTER remains the source of truth for task policy, audit evidence, GitHub CI status and acceptance decisions. Orca IDE is an optional developer workstation/mobile control surface, **not** an approval authority or a trusted HAK backend.

No Orca-specific API, webhook, authentication protocol or phone pairing mechanism is assumed here. Verify supported integration interfaces against the installed Orca version before implementing an adapter. Do not expose the HAK loopback service to public networks or mobile clients directly.

## Initial integration: GitHub and isolated workspace

1. Install Orca from a verified official distribution on an operator-managed Windows machine. Check signatures and requested permissions.
2. Clone this repository into a dedicated non-production workspace. Run `npm run check` and `npm test` locally before authorizing any agent writes.
3. Allow Orca-controlled coding agents to edit only the working tree and create feature branches. Use least-privilege GitHub credentials. Do not place tokens, accounting data, employee records or other secrets into agent prompts, logs or mobile notifications.
4. Agents may propose patches and open PRs. GitHub Actions must run on the exact PR head SHA. HAK's existing evidence and acceptance checks remain independent of Orca.
5. Require normal branch protection, human review when configured, and GitHub's own merge authorization. Orca tool approvals are **not** GitHub PR approvals. Never use an agent to impersonate a reviewer or relax branch protection.
6. Treat mobile pairing as remote access to the workstation. Review device revocation, session expiry, cloud relay/data handling, authentication and audit behavior before enabling it with HAK repositories.

## Adapter contract (future, gated)

A future Orca adapter must be opt-in and disabled by default. It may ingest only normalized, authenticated, bounded and replay-protected task status events; never raw shell commands, tokens or arbitrary URLs. Validate event schemas and IDs, record timestamps and source provenance, and keep all acceptance decisions server-side. Reject unknown actions and never interpret an Orca completion notification as evidence of successful CI or production deployment.

## Acceptance checklist

- [ ] Official Orca binary/source version and license independently verified
- [ ] Windows desktop installation and mobile pairing tested by operator
- [ ] Permission boundaries, cloud relay/data residency and device revocation assessed
- [ ] Isolated feature-branch edit and PR creation demonstrated without secrets
- [ ] Windows/Ubuntu CI checked against exact commit SHA
- [ ] Review/branch protection enforced (including negative tests)
- [ ] HAK acceptance packet and audit trail generated and verified
- [ ] OmniRoute, Ruflo, Claude-Mem, Archify and OCR separately verified; no provider declared live solely from mocks

**Status:** design guidance only. CI passing is not equivalent to real Orca, Windows workstation or external-provider acceptance.
