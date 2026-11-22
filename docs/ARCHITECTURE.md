# HAK AI Agent Control Center — architecture

MVP exposes localhost-only authenticated HTTP endpoints for task event ingestion and skill observations. All state is **in memory** and disappears on restart. It is not a multi-agent executor, durable audit log, web dashboard, or production service.

## Planned adapters
- Claude Code task observer: opt-in local event bridge; validate original license and hook interface before copying code.
- Skill observation: store improvement proposals as pending; require review before modifying HAK_AI_SKILLS.
- Ruflo orchestration: future adapter with per-agent scope, worktree isolation, CI gate, human merge approval.

## Security
Bearer token >=24 chars required; bound to 127.0.0.1; do not expose via reverse proxy without TLS, per-agent auth, rate limiting, persistence and threat review. Do not log secrets, CCCD or account numbers.

## Delivery
Branch → PR → Node 20/22 CI → review → merge. CI validates the MVP only, not upstream Task Observer or Ruflo integration.
