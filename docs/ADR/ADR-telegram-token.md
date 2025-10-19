# ADR: Remove Hardcoded Telegram Token

- **Status**: Accepted
- **Date**: 2025-10-19

## Context
Early exploratory scripts committed a real Telegram bot token directly to `app/test-bot.js`. The repository is public and shared across multiple engineers and automation agents, meaning any leaked credential could expose the bot to abuse or revocation. We also lacked written guidance on how to run manual Telegram checks safely.

## Decision
1. Delete the hardcoded token and replace the harness with an environment-driven flow (`TELEGRAM_BOT_TOKEN` / `TG_TOKEN`). The script now skips live traffic unless explicit credentials are supplied.
2. Keep `.env.example` empty but annotate the Telegram variables so engineers know how to configure them locally.
3. Document the secure flow in `docs/DeveloperGuide.md` and `docs/AutomationGuide.md`, highlighting the requirement to use keytar or runtime environment variables.
4. Add this ADR to track the rationale and prevent regressions.

## Consequences
- Repository history no longer contains active secrets. CI and local scripts must source credentials from environment variables or the OS keychain.
- Manual testers have clear guidance on enabling live Telegram interactions without editing code.
- Security posture improves by aligning with least-privilege and secret-scanning policies.
