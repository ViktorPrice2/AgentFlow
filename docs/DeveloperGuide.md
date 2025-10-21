# Developer Guide

This guide explains the internals of AgentFlow Desktop so you can extend the platform, reason about runtime behaviour, and keep production parity. It covers architecture, storage, IPC boundaries, and developer workflows.

## Architecture Overview
- **Electron main process (`app/main/`)** creates windows, registers IPC handlers, manages lifecycle logging, and bootstraps plugins, providers, scheduler, preset loaders, and Telegram IPC.
- **Core runtime (`app/core/`)** exposes orchestrator, scheduler, API facade, storage abstraction, provider manager, preset utilities, and security helpers shared by main and renderer.
- **Renderer (`app/renderer/`)** is a Vite + React single-page app. It consumes IPC-backed `agentApi` helpers, renders dashboards (projects, briefs, agents, pipelines, reports, presets, settings), and maintains local state with hooks and contexts.
- **Scripts (`scripts/`, `app/scripts/`)** run orchestrator pipelines, verify automation health, and execute CI gates.
- **Data layer (`app/data/`)** houses the SQLite database, WAL logs, generated artifacts, and operational jsonl logs (scheduler, telegram, app lifecycle).

The execution flow: the Electron main process loads environment variables, ensures migrations, instantiates the provider manager and scheduler, and registers IPC channels through `app/core/api.js`. The renderer triggers IPC requests via `app/renderer/src/api/agentApi.js`, which the main process fulfils by delegating to core services (entity store, orchestrator, scheduler, provider manager).

## Core Modules
- **Orchestrator (`app/core/orchestrator.js`)** executes pipeline graphs. Nodes reference agent implementations provided by the plugin registry or user-configured overrides. The orchestrator creates a run context, emits structured log events, writes artifacts under `data/artifacts/<runId>/`, tracks node outputs, and returns a run summary.
- **Scheduler (`app/core/scheduler.js`)** loads schedules from SQLite, validates cron expressions, persists `nextRun` timestamps, and triggers `runPipeline` with isolation guards. It logs lifecycle events to `data/logs/scheduler.jsonl` and exposes IPC handlers for manual triggers and status checks.
- **Provider Manager (`app/core/providers/manager.js`)** reads `config/providers.json`, consults environment variables for credentials, applies rate-limit and circuit-breaker policies, and exposes diagnostics. It can fall back to deterministic mock responses when credentials are missing.
- **API Facade (`app/core/api.js`)** assembles IPC endpoints for agents, providers, pipelines, schedules, and run execution. It maintains an in-memory mirror of agent configs derived from the entity store, auto-seeds default agents, and wraps orchestrator invocations.
- **Storage (`app/core/storage/entityStore.js`)** encapsulates SQLite access: CRUD for agents, pipelines (with versioning), history diffs, schedules, and metadata updates.
- **Preset utilities (`app/core/presets/`)** validate preset files, cache them on disk, and apply preset agents/pipelines to projects while tagging copied entities with `source: "preset"` and `originPresetVersion` metadata.
- **Security Utils (`app/core/utils/security.js`)** enforces filesystem allow-lists, sanitises filenames and artifact paths, and redacts secrets from logs or human-readable outputs.

## Database Schema
SQLite lives at `app/data/app.db` (WAL enabled). Schema migrations in `app/db/migrations/` cover:
- `Projects` — top-level container (id, name, description) plus brief workflow fields such as `briefStatus`, `briefProgress`,
  `needsAttention`, Telegram deeplink metadata, `presetId`, `presetVersion`, and `presetDraft` for pending updates.
- `Agents` — stored configs with `version`, `config` JSON, project linkage, and preset markers (`source`, `originPresetVersion`).
- `Pipelines` — graph definitions (nodes, edges, override metadata) and preset markers mirroring the agent schema.
- `Runs` — execution history with status, input/output payload snapshots.
- `Briefs` — marketing brief summaries and detailed answer maps persisted after Telegram sessions finish.
- `Reports` — pipeline report entries with Markdown/JSON content, status, linked artifacts, and timestamps.
- `Schedules` — cron metadata, enable flags, `nextRun`.
- `TelegramContacts` — reusable chat handles with invite status, labels, and project association.
- `EntityHistory` — append-only audit for versioned agent/pipeline payloads.
- `Logs` — structured event stream for orchestrator, scheduler, telegram bot, and telemetry.

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

## Preset-driven Projects
- Preset files under `app/config/industries/` describe surveys, agent bundles, and pipelines. They are validated at load time by
  `app/core/presets/industryPresetSchema.js`, which throws `IndustryPresetValidationError` if a structure deviates from the
  contract defined in `app/types/industryPreset.d.ts`.
- `app/core/presets/loader.js` discovers preset files, caches them by checksum, and exposes `listPresets`, `loadPreset`, and
  `diffPreset` helpers. Electron IPC bridges surface these helpers to the renderer for preset selection and upgrade prompts.
- Applying a preset uses `app/core/presets/applyPreset.js`. The service removes stale preset-sourced agents/pipelines, copies the
  latest definitions into the project with scoped ids, and sets `source: "preset"` plus `originPresetVersion` so future updates
  only touch preset-managed records.
- Project rows keep `presetId`, `presetVersion`, `briefVersion`, and `presetDraft` blobs to coordinate moderation flows and LLM
  suggestions before a preset upgrade is confirmed.

## Brief Lifecycle & Telegram Integration
- The Telegram bot (`app/main/ipcBot.js`) drives the survey. During `/start` it creates a session, updates `Projects.briefStatus`
  to `collecting`, and streams progress to the renderer via the `brief:statusChanged` event.
- Each response updates `briefProgress`. Unanswered questions populate the `needsAttention` payload used by the renderer to
  highlight missing fields. When `/finish` is invoked, the bot saves the brief record and flips the project to `review`.
- Projects surface a “Approve brief” action in the renderer. Confirming the brief toggles the status to `approved`, allowing the
  preset pipelines to run without manual gating.
- Telegram contacts persist in `TelegramContacts`. IPC handlers (`AgentFlow:telegram:contacts:*`) allow the renderer to create
  reusable contacts, send invites via `sendProjectInvite`, and record invite timestamps/statuses back on the project row.
- All Telegram interactions (start/stop, survey events, invite attempts) append structured entries to
  `app/data/logs/telegram-bot.jsonl` for auditability.

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
- Preset format and lifecycle: `docs/IndustryPreset.md`
