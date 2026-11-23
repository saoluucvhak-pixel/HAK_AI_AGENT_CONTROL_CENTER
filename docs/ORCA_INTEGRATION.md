# Orca IDE read-only integration baseline

HAK_AI_AGENT_CONTROL_CENTER remains the central policy, CI, approval and acceptance authority.
Orca is an optional Windows/mobile operator environment.

Install Orca and register the CLI under Settings → General → Orca CLI.
Verify locally with `orca status --json`. The opt-in `probeOrca({enabled:true})`
runs only that fixed command, without a shell, with a 5-second timeout and 64 KiB cap.
It returns only status and connected, never raw output, credentials or local paths.
It does not start agents, invoke paid models, pair a mobile device or merge PRs.

Acceptance still requires a real Windows host test, separate mobile pairing evidence,
explicit per-action authorization, CI on Windows/Ubuntu, security review and independent
GitHub approval where branch protection requires it. Ruflo, Claude-Mem, Archify,
OCR and OmniRoute require separate integration evidence.

Official CLI reference: https://orca.dev/docs/cli/overview
