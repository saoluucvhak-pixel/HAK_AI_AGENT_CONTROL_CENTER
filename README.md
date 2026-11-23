# HAK AI Agent Control Center

Quản lý task và giám sát AI Agent HAK. Mọi thay đổi chức năng đi qua PR và CI.

## Windows quick start

Install Node.js 22+ once, then double-click `HAK_START_WINDOWS.cmd`. It starts the local dashboard at http://127.0.0.1:4317 and opens your browser. If HAK is already running, it opens the existing instance; if another program owns the port, it refuses to connect to it. Task Observer status reads require no manual token. Sending agent events still requires a configured bearer token. This is not a Windows installer or an acceptance of external AI agents.

## Windows acceptance baseline
After pulling the latest `main`, double-click `HAK_ACCEPT_WINDOWS.cmd` to run local syntax, unit tests and configured loopback connectivity checks. This is separate from `HAK_START_WINDOWS.cmd` (dashboard startup). The console remains open to show a sanitized status summary. It does not run real agents, certify external tools or mark production readiness. See `docs/PRODUCTION_ACCEPTANCE.md` and Issue #32 for the remaining operator-approved checks.
