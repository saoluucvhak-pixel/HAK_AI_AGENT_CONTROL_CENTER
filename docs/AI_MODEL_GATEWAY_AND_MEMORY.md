# OmniRoute + Claude-Mem integration — HAK v0.2 pilot

## Verified upstream
- OmniRoute: https://github.com/cheaper-inference/OmniRoute — MIT, gateway supporting OpenAI-style chat completions and provider routing; tested documentation for v3.8.55, Node >=22.22.2 or >=24.
- Claude-Mem: https://github.com/thedotmack/claude-mem — Apache-2.0 in current main; check the specific tag, NOTICE, bundled components and commercial boundary before vendoring. Persistent memory uses session hooks, SQLite, optional semantic search, local worker and MCP.
- Neither project is vendored or automatically installed by this PR.

## HAK architecture
Agent Control Center -> task policy -> OmniRoute localhost gateway -> approved provider models.
Agent lifecycle -> explicit memory review/redaction -> optional Claude-Mem local instance -> scoped retrieval.
Ruflo manages agent delegation; Task Observer tracks events; OmniRoute routes model API; Claude-Mem persists *approved* memory. These systems must not be conflated.

## Pilot implementation
- `src/integrations.js` exports `routeModel` and `claudeMemBridge`. They are library functions only, not a running web server.
- Model routing is **disabled by default**. Set `HAK_OMNIROUTE_ENABLED=true`, `HAK_OMNIROUTE_URL=http://127.0.0.1:20128`, `HAK_OMNIROUTE_API_KEY` via secret manager and optionally `HAK_OMNIROUTE_MODEL=auto`. Only loopback HTTP is allowed.
- A valid local gateway must already be running and configured with approved provider credentials. No API keys are stored in repository.
- `claudeMemBridge` is an **opt-in policy contract**, not a Claude-Mem API client. Set `HAK_CLAUDE_MEM_ENABLED=true` only after a reviewed memory export and project-specific access controls exist.
- Do not install Claude-Mem hooks on all repos globally. Pilot in one non-sensitive development repository. Avoid automatic capture of private payroll, ID numbers, bank accounts, client contracts, prompts or tool outputs.
- External providers may receive prompt contents even when OmniRoute runs locally. Disable remote routes for offline/confidential tasks. No automatic fallback to unapproved providers.
- Quota-aware routing, token savings and free tier claims are upstream claims; benchmark actual HAK traffic before adopting.
- This adapter uses OpenAI-compatible `/v1/chat/completions`; native Anthropic-specific features/tool calling require separate compatibility tests.

## Test/rollout gates
1. Run `npm run check && npm test` with Node 20 and 22.
2. Local gateway integration tests: auth failure, timeout, provider outage, approved fallback, model mismatch and cost accounting.
3. Claude-Mem integration tests: approved project scoping, redaction, deletion, backup, restart and memory retrieval across sessions.
4. Security review: key rotation, dependency scanning, log scrubbing, prompt-injection isolation, outbound traffic allowlist and terms of service.
5. Run end-to-end test with one agent and synthetic data, then 4–8 agents with concurrency limits. No merge of runtime orchestration until acceptance gates pass.

## Current limitations
The code in this PR is a **gateway client pilot and memory policy bridge**, not a fully operational multi-agent platform, not a Claude-Mem plugin installation, and not a production-grade auth system.
