# Orca IDE read-only integration baseline

HAK_AI_AGENT_CONTROL_CENTER remains the central policy, CI, approval and acceptance authority.
Orca is an optional Windows/mobile operator environment.

Install Orca and register the CLI under Settings → General → Orca CLI.
Verify locally with `orca status --json`. The opt-in `probeOrca({enabled:true})`
runs only that fixed command, without a shell, with a 5-second timeout and 64 KiB cap.
It returns only status and connected, never raw output, credentials or local paths.
It does not start agents, invoke paid models, pair a mobile device or merge PRs.

On the operator-approved Windows host, run `npm run accept:orca` to perform the same
read-only probe and print only sanitized `status` and `connected`. Exit code 1 means
Orca is unavailable or the response was invalid; do not treat that as evidence of a
failed mobile pairing. CI runs only the deterministic absent-CLI regression test.

Acceptance still requires a real Windows host test, separate mobile pairing evidence,
explicit per-action authorization, CI on Windows/Ubuntu, security review and independent
GitHub approval where branch protection requires it. Ruflo, Claude-Mem, Archify,
OCR and OmniRoute require separate integration evidence.

Official CLI reference: https://orca.dev/docs/cli/overview
