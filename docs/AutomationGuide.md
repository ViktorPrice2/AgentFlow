# Automation Guide

This guide describes the orchestrated automation that drives AgentFlow Desktop: DAG execution, workitems, CI gates, verification tasks, and generated reports.

## DAG Definition (`plans/dag.json`)
- Directed acyclic graph containing automation nodes. Each node has:
  - `id` - unique workitem identifier.
  - `type` - semantic category (`verify`, `test`, etc.).
  - `in` / `out` arrays - upstream and downstream node ids (optional).
- Example:
  ```json
  {
    "nodes": [
      { "id": "W-VRF-01", "type": "verify", "out": ["W-TST-01"] },
      { "id": "W-TST-01", "type": "test", "in": ["W-VRF-01"], "out": [] }
    ]
  }
  ```
- Extend the DAG by appending nodes to the array and wiring `in`/`out` relationships. Keep the graph acyclic; the orchestrator processes nodes in the order defined.

## Workitems (`plans/workitems/*.json`)
- Each node references a workitem manifest containing:
  - `id` - matches DAG node.
  - `goal` - plain-language objective (prefer ASCII to avoid encoding drift).
  - `inputs` - files or modules required for the task.
  - `outputs` - expected artifacts (tests, docs, reports).
  - `acceptance` - bullet list of acceptance criteria.
- Workitems fuel documentation and reviewers; keep them in sync with reality when implementing new automation.

## Orchestrator (`scripts/orchestrator.mjs`)
- Loads the DAG, iterates nodes sequentially, и вызывает:
  - `node ./scripts/tasks/verify.mjs` для `W-VRF-01`.
  - `node ./scripts/run-agent.mjs <nodeId>` для остальных узлов. Скрипт считывает `plans/workitems/<id>.json` и запускает команды на основе ожидаемых артефактов (витест для unit-тестов, `npm run verify` для проверок и т. п.). Расширяйте обработчик при добавлении новых типов выходов.
  - `node ./scripts/ci-checks.mjs` after each node to enforce build/lint/test/audit.
- Captures results and writes `reports/summary.json` containing run id, timestamps, per-node status, and aggregated checks (scheduler, i18n, telegram, e2e).
- Ensures `reports/` exists before writing outputs.
- Entry point: `npm run orchestrate`.

## CI Checks (`scripts/ci-checks.mjs`)
- Executes within each orchestrator node:
  1. Renderer build (`npm run build:renderer --prefix app`)
  2. ESLint with zero warnings (`npm run lint --prefix app`)
  3. Vitest coverage suite (`npm run test:ci --prefix app`)
  4. `npm audit --omit=dev --audit-level=high` (warnings allowed for moderate issues)
- Fails fast on build, lint, or unit test errors. Exit codes bubble back to the orchestrator, marking the current node as failed.

## Verification Task (`scripts/tasks/verify.mjs`)
- Performs environment and integration checks:
  - **Scheduler heartbeat** - Reads the last JSON line from `app/data/logs/scheduler.jsonl`, validates timestamp freshness (<=3 minutes).
  - **i18n completeness** - Ensures `app/renderer/src/i18n/en.json` and `ru.json` exist with non-empty key sets.
- **Telegram IPC** - Imports `app/main/ipcBot.js` to verify `registerTelegramIpcHandlers` export and inspects `.env`/process variables for `TG_TOKEN` and `TG_CHAT_ID`. Missing tokens result in `pending`.
- Telegram secrets are never stored in the repository. Provide temporary values via CI secrets or local environment variables when running Telegram-specific checks.
- Generates:
  - Markdown report (`docs/VerificationReport.md`) with checkbox summaries.
  - Machine-readable JSON (`reports/verify.json`) used by orchestrator summaries.
- Extend the task by adding new verifiers and update this guide accordingly.

## Reports
- `reports/summary.json` - Overall orchestrator run summary (inputs, acceptance references, status per node, aggregated checks).
- `reports/verify.json` - Raw verification outcomes (scheduler, i18n, telegram structures).
- `docs/VerificationReport.md` - Human-readable verification status; keep committed to document the latest run.
- `reports/e2e/` - Playwright outputs (`smoke.xml` + HTML в `reports/e2e/html/index.html`).

## Operational Tips
- When adding new nodes, ensure corresponding workitems exist and update CI scripts if additional checks are required.
- Keep workitem text ASCII-only; previous encoding issues surfaced when non-UTF8 writers were used.
- For manual verification, run `node scripts/tasks/verify.mjs` after starting the app to ensure scheduler and Telegram logs are seeded.

Refer to `docs/DeveloperGuide.md` for architectural context and to `README.md` for daily workflows.
