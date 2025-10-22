# AgentFlow Internal API

## MasterAgent

### `generatePlan(input, options)`
Generates a task plan by requesting the ProviderManager for LLM assistance. Falls back to template heuristics defined in `planBuilder`.

- `input` – user prompt describing campaign goals
- `options.contentTypes` – array of `text | image | video`
- `options.tone` – tonal preference string

### `createTask(input, options)`
Persists the generated plan in SQLite and returns the `TaskRecord`.

### `executeTask(taskId, options)`
Executes the task DAG with retries, Guard validation, and HumanGate fallback. Updates run status, logs, and artifacts.

- `options.mode` – `'mock' | 'real'`
- `options.locale` – `'en' | 'ru'`

## ProviderManager

### `invoke(request)`
Routes provider calls, respecting rate limits and priority-based fallback.

- `request.model` – model identifier (e.g., `gpt-4o-mini`)
- `request.type` – `text | image | video`
- `request.prompt` – string prompt
- `request.payload` – provider-specific options

Returns `ProviderResponse` with text content, URLs, or binary data.

## Agent Context (`ctx`)

Agents receive a context object containing:

- `task` / `run` – database records for the current execution
- `providerManager` – access to AI providers
- `storage` – artifact persistence helper
- `logger` – run-scoped logger writing to SQLite
- `mode` – `'mock' | 'real'`
- `locale` – `'en' | 'ru'`

## DiagnosticAgent

The DiagnosticAgent consumes run/log data and writes a Markdown report to `docs/VerificationReport.md`. Invoke it manually via `npm run verify` or as part of maintenance workflows.
