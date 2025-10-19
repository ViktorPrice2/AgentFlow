# Developer Guide

This guide explains the internals of AgentFlow Desktop so you can extend the platform, reason about runtime behaviour, and keep production parity. It covers architecture, storage, IPC boundaries, and developer workflows.

## Architecture Overview
- **Electron main process (`app/main/`)** creates windows, registers IPC handlers, manages lifecycle logging, and bootstraps plugins, providers, scheduler, and Telegram IPC.
- **Core runtime (`app/core/`)** exposes orchestrator, scheduler, API facade, storage abstraction, provider manager, and security utilities shared by main and renderer.
- **Renderer (`app/renderer/`)** is a Vite + React single-page app. It consumes IPC-backed `agentApi` helpers, renders dashboards (projects, briefs, agents, pipelines, scheduler, reports, settings), and maintains local state with hooks and contexts.
- **Scripts (`scripts/`, `app/scripts/`)** run orchestrator pipelines, verify automation health, and execute CI gates.
- **Data layer (`app/data/`)** houses the SQLite database, WAL logs, generated artifacts, and operational jsonl logs (scheduler, telegram, app lifecycle).

The execution flow: the Electron main process loads environment variables, ensures migrations, instantiates the provider manager and scheduler, and registers IPC channels through `app/core/api.js`. The renderer triggers IPC requests via `app/renderer/src/api/agentApi.js`, which the main process fulfils by delegating to core services (entity store, orchestrator, scheduler, provider manager).

## Core Modules
- **Orchestrator (`app/core/orchestrator.js`)** executes pipeline graphs. Nodes reference agent implementations provided by the plugin registry or user-configured overrides. The orchestrator creates a run context, emits structured log events, writes artifacts under `data/artifacts/<runId>/`, tracks node outputs, and returns a run summary.
- **Scheduler (`app/core/scheduler.js`)** loads schedules from SQLite, validates cron expressions, persists `nextRun` timestamps, and triggers `runPipeline` with isolation guards. It logs lifecycle events to `data/logs/scheduler.jsonl` and exposes IPC handlers for manual triggers and status checks.
- **Provider Manager (`app/core/providers/manager.js`)** reads `config/providers.json`, consults environment variables for credentials, applies rate-limit and circuit-breaker policies, and exposes diagnostics. It can fall back to deterministic mock responses when credentials are missing.
- **API Facade (`app/core/api.js`)** assembles IPC endpoints for agents, providers, pipelines, schedules, and run execution. It maintains an in-memory mirror of agent configs derived from the entity store, auto-seeds default agents, and wraps orchestrator invocations.
- **Storage (`app/core/storage/entityStore.js`)** encapsulates SQLite access: CRUD for agents, pipelines (with versioning), history diffs, schedules, and metadata updates.
- **Security Utils (`app/core/utils/security.js`)** enforces filesystem allow-lists, sanitises filenames and artifact paths, and redacts secrets from logs or human-readable outputs.

## Database Schema
SQLite lives at `app/data/app.db` (WAL enabled). Schema migrations in `app/db/migrations/` cover:
- `Projects` - top-level container (id, name, description, status timestamps).
- `Agents` - stored configs with `version`, `config` json, project linkage.
- `Pipelines` - graph definitions (nodes, edges) plus `version`.
- `Runs` - execution history with status, input/output payload snapshots.
- `Briefs` - marketing brief summaries and detailed answer maps.
- `Schedules` - cron metadata, enable flags, `nextRun`.
- `Metrics` / `Reports` - aggregate outputs and generated reports.
- `EntityHistory` - append-only audit for versioned agent/pipeline payloads.
- `Logs` - structured event stream for orchestrator/scheduler/telemetry.

Run `node app/main/db/migrate.js` to apply migrations and assert indexes. The migrator verifies runtime-critical tables (`Agents`, `Pipelines`, `Runs`, `Briefs`, `Logs`) are present before boot finishes.

## IPC & API Layer
- `app/main/main.js` registers IPC routes using `registerIpcHandlers` (agents/providers/pipelines/schedules), `registerSchedulerIpcHandlers` (status, trigger, toggle), and `registerTelegramIpcHandlers` (bot lifecycle, proxy config).
- Renderer calls live in `app/renderer/src/api/agentApi.js`, returning structured promises. Errors are routed through `app/core/errors.js` which includes telemetry, UI toast integration, and crash-safe logging.
- Event streams (logs, Telegram status) are pushed to renderer windows using a queue to survive renderer reloads.

## Renderer Composition
- Entry point: `app/renderer/src/App.jsx` wires navigation, i18n (`useI18n`), theming, toast notifications, and aggregated status panels.
- Pages such as `AgentsPage.jsx`, `PipelinesPage.jsx`, and `SchedulerPage.jsx` consume agents/pipelines/schedule APIs, surface version histories, and allow CRUD operations (extended in later milestones).
- Shared hooks (`usePersistentState`, `useI18n`, theme provider) manage cached preferences and localization.
- `renderer` is built by Vite; production assets sit under `app/renderer/dist/` and are bundled by `electron-builder`.

## Orchestrator & Scheduler Interaction
- Manual runs originate from the renderer (pipeline run button) or CLI orchestrator. The orchestrator records run metadata, collects artifacts, and emits node-level summaries.
- Scheduler tasks are registered at app startup. Cron expressions are validated, persisted, and executed using `node-cron` when available, with a fallback interval scheduler when `node-cron` is absent. Manual override via `runScheduleNow` IPC triggers pipelines immediately and appends log lines with run context.
- Scheduler health is tracked through `registerSchedulerIpcHandlers` exposing `status`, `triggerNow`, `toggleSchedule`, and log tailers consumed by the UI and verification tasks.

## Providers & Secrets
- Provider definitions reside in `app/config/providers.json`. Each provider entry lists `id`, `type`, optional `apiKeyRef`, available models, and rate-limit policies.
- Secrets are pulled from environment variables referenced by `apiKeyRef`. Missing credentials cause mock engines to kick in, ensuring pipelines can operate in development without external calls.
- `maskSecrets` and `redactSensitive` ensure logs, UI surfaces, and exported reports do not leak tokens. When extending providers, reuse these utilities and update tests under `tests/unit/security.*`.

### Telegram bot credentials
- Never hardcode bot tokens in source control. Use the OS keychain via `keytar` (default flow in the app) or export `TELEGRAM_BOT_TOKEN`/`TG_TOKEN` before launching integration scripts.
- The helper script `app/test-bot.js` skips live traffic unless a token is present in the environment. It always stores placeholder values when running in CI.
- `.env.example` intentionally keeps Telegram variables empty; copy the file to `.env` locally and populate the values out-of-band if you need persistent configuration.
- Logs in `app/data/logs/telegram-bot.jsonl` redact sensitive fields automatically, but always review before sharing outside the team.

## Default Agent Roles
- **WriterAgent** - templated content generator producing title, caption, description, and summary fields based on project context.
- **UploaderAgent** - simulated uploader that assembles artifacts from writer outputs and records publish status.
- **StyleGuard** - rule-based validator enforcing disallowed terms and drafting review messages.
- **HumanGate** - approval placeholder that auto-approves by default but retains hooks for human-in-the-loop signoff.

Custom agents can be registered via the plugin registry or stored in SQLite using `entityStore.saveAgent`. Default agents are re-seeded on launch to guarantee a working pipeline.

## Testing Strategy
- **Unit tests** live under `app/tests/` (Vitest). Run `npm run test:ci --prefix app` for coverage using V8 instrumentation. Focus areas include orchestrator control flow, scheduler edge cases, providers, and sanitizers.
- **End-to-end tests** reside in `tests/e2e/` (Playwright). Execute with `npm run test:e2e --prefix app`. Use `playwright.config.js` to target the Electron app and include smoke regressions.
- **CI gate** (`scripts/ci-checks.mjs`) runs renderer build, lint, coverage suite, and npm audit (fails on high/critical vulnerabilities).
- **Verification** (`scripts/tasks/verify.mjs`) checks scheduler heartbeat, i18n completeness, and Telegram IPC wiring; results are exported to `docs/VerificationReport.md` and `reports/verify.json`.
- Для Playwright-тестов включайте e2e-мост (`window.e2e`) установкой `E2E=1` перед запуском. В production-сборке мост отсутствует; `scripts/check-e2e-bridge.mjs` гарантирует чистоту бандла.

## Logging & Observability
- Scheduler logs: `app/data/logs/scheduler.jsonl`
- Telegram logs: `app/data/logs/telegram-bot.jsonl`
- App lifecycle: `app/data/logs/app-start.jsonl`
- Orchestrator summaries: `reports/summary.json`
- Verification outcomes: `docs/VerificationReport.md`, `reports/verify.json`
- Use `maskSecrets` when exporting logs to avoid credential leakage.

## Extending Agents & Pipelines
1. Add or update agent configurations via the UI or by editing `Agents` records through `entityStore.saveAgent`.
2. Custom plugin agents go under `app/core/agents/` (follow plugin loader conventions).
3. Pipelines are defined as node/edge graphs (renderer UI generates JSON with `nodes`, `edges`, optional router conditions). Persist using `entityStore.savePipeline`.
4. Version history is automatically managed; inspect via `entityStore.listHistory` and UI history modal.

## Build & Packaging
- Development: `npm run dev --prefix app` (spawns renderer Vite server and Electron main process).
- Production build: `npm run build --prefix app` (runs Vite build and `electron-builder` to produce NSIS installer under `app/dist/`).
- Continuous orchestration: `npm run orchestrate` (root) iterates DAG nodes, runs associated scripts, and publishes `reports/summary.json`.

## Additional References
- Automation internals: `docs/AutomationGuide.md`
- Verification status: `docs/VerificationReport.md`
- Release notes: `docs/CHANGELOG.md`
