# AgentFlow v2 Developer Guide

AgentFlow v2 is a modular desktop application built with Electron, Node.js, and React. The system orchestrates specialized agents that generate marketing content across text, image, and video formats.

## Project Structure

```
app/
  agents/          # Individual agent implementations and manifests
  core/            # MasterAgent, ProviderManager, repositories, storage
  ui/              # React components, pages, and styling
  config/          # Provider and validation configuration files
  db/              # SQLite migrations and seeds
  data/            # Runtime database and artifacts
scripts/           # CLI utilities for migrations, orchestration, verification
tests/             # Unit and integration tests (Vitest)
docs/              # Developer and API documentation
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run database migrations and seed data:
   ```bash
   npm run migrate
   npm run seeds
   ```
3. Start the desktop application in development mode:
   ```bash
   npm run dev
   ```
4. Run tests:
   ```bash
   npm run test
   npm run test:e2e
   ```

## Adding a New Agent

1. Create a folder under `app/agents/<agent-name>/` containing:
   - `manifest.json` describing metadata, supported models, and mock output
   - `index.ts` exporting an object with an `execute(payload, ctx)` method
2. The MasterAgent discovers agents via `AgentLoader`, so no manual registration is required.
3. Use `ctx.providerManager.invoke` for LLM or generation requests and `ctx.storage.saveArtifact` to persist outputs.

## Testing Strategy

- **Unit tests** cover plan generation, provider fallbacks, and agent helpers.
- **Integration tests** run the MasterAgent against the local mock providers and SQLite database.
- **E2E tests** (Playwright) validate the UI wizard, progress, and results flow.

## Troubleshooting

- Verify that `app/data/` is writable; artifacts and the SQLite database are stored there.
- When adding providers, update `app/config/providers.json` and re-run `npm run seeds`.
- Diagnostic reports are written to `docs/VerificationReport.md` via the DiagnosticAgent.
