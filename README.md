# HAK AI Agent Control Center v0.1.0

Local Task Observer MVP: authenticated HTTP event ingestion, current task status and pending AI Skill improvement proposals. **No upstream Task Observer or Ruflo code has been copied or integrated yet.**

## Requirements
Node.js 20 or 22. Set a private `HAK_OBSERVER_TOKEN` environment variable of at least 24 characters, then run:

```sh
npm run check
npm test
npm start
```

The server binds to `127.0.0.1:8080` by default. Use `Authorization: Bearer <token>` for all routes.

- `GET /health` → health status
- `GET /tasks` → latest task states
- `POST /events` → JSON with taskId, agentId, status (queued/running/passed/failed/blocked)
- `GET /observations` → proposed skill improvements
- `POST /observations` → JSON with skill, problem, proposal; approval stays pending

**Limitations:** in-memory state only, no UI, no Ruflo execution, no Claude Code hooks, no persistence, no multi-user permissions. See [architecture](docs/ARCHITECTURE.md). Never expose this MVP to the public Internet.
