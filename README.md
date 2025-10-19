# AgentFlow Desktop

AgentFlow Desktop is an Electron application that orchestrates multi-agent marketing workflows. It combines a hardened Node and Electron core, a React renderer, and a SQLite-backed data layer to provide an offline-first control plane for pipelines, schedulers, and human-in-the-loop automation.

## Highlights
- Multi-agent pipelines with versioned definitions and execution history.
- Electron main process with React-based renderer UI and modular plugin registry.
- SQLite datastore with schema migrations, history tracking, and WAL support.
- Built-in scheduler with cron-style triggers, run logs, and manual overrides.
- Provider manager with config-backed credentials and mock diagnostics.
- Telegram bot bridge, verification pipeline, and observability reports.
- Strict filesystem sandboxing helpers and secret redaction utilities.

## Quick Start
1. **Prerequisites**
   - Node.js 20 (or newer) and npm 10.
   - Playwright browsers (for UI tests): `npx playwright install --with-deps`.
2. **Install dependencies**
   ```bash
   npm install
   npm install --prefix app
   npm run e2e:install --prefix app
   ```
3. **Configure environment**
   ```bash
   cd app
   cp .env.example .env
   # populate TG_TOKEN, TG_CHAT_ID, and provider secrets as needed
   ```
4. **Prepare the database**
   ```bash
   node app/main/db/migrate.js
   ```
5. **Run in development**
   ```bash
   npm run dev --prefix app
   ```
6. **Build the desktop package**
   ```bash
   npm run build --prefix app
   ```

## Testing and Automation
- Lint: `npm run lint --prefix app`
- Unit tests with coverage: `npm run test:ci --prefix app`
- Playwright end-to-end suite: `npm run test:e2e --prefix app`
- Full gate: `npm run test:all --prefix app`
- DAG orchestrator: `npm run orchestrate`
- Verification tasks: `node scripts/tasks/verify.mjs`
- Bundle hygiene: `node scripts/check-e2e-bridge.mjs`
- Execute a specific workitem: `node scripts/run-agent.mjs <workitem-id>`

Automation details, including DAG and workitem semantics plus verification outputs, are documented in `docs/AutomationGuide.md`. Testing strategy and CI hand-offs are described in `docs/DeveloperGuide.md`.

## Project Layout
```
app/                Electron and React application
  config/           Provider configs, environment templates
  core/             Orchestrator, scheduler, API, storage, utils
  data/             SQLite database, logs, artifacts, briefs
  main/             Electron main process, IPC bridges, migrations
  renderer/         Vite and React renderer sources, components, pages
  scripts/          App-scoped tooling (orchestrator, verify, CI)
  tests/            Unit tests (Vitest) and fixtures
docs/               Documentation, verification report, changelog
plans/              DAG definition and workitem manifests
reports/            Generated run summaries and verification outputs
scripts/            Root-level orchestrator, CI helpers
tests/              End-to-end Playwright specs
```

## Documentation Map
- `docs/DeveloperGuide.md` - architecture, data flows, customization recipes.
- `docs/AutomationGuide.md` - DAG and workitems, CI gates, verification outputs.
- `docs/VerificationReport.md` - latest verification status (generated).
- `docs/CHANGELOG.md` - release history.

## Licensing
AgentFlow Desktop is published under the MIT License. See `LICENSE` (if present) or package metadata for details.
