# Industry Preset Reference

Industry presets describe reusable surveys, agent bundles, and pipelines for specific verticals. They live alongside the app
configuration and are loaded at runtime to bootstrap projects or offer upgrade paths when presets evolve.

## Directory Layout
- **`app/config/industries/`** — JSON preset files. The filename (without `.json`) becomes the preset identifier when `meta.id`
  is omitted.
- **`app/config/industries/generic.json`** — Baseline preset shipped with the app. Use it as a template when authoring new
  definitions.
- **`app/types/industryPreset.d.ts`** — TypeScript contract consumed by the renderer and tests. Update this file whenever a new
  field is introduced.
- **`app/core/presets/industryPresetSchema.js`** — Runtime validator that mirrors the TypeScript contract and throws descriptive
  `IndustryPresetValidationError` instances on invalid payloads.
- **`app/core/presets/loader.js`** — Loader utilities that discover preset files, cache parsed content, and expose helpers for
  listing, loading, and diffing presets.
- **`app/core/presets/applyPreset.js`** — Service that clones preset agents and pipelines into a project while keeping metadata
  about the preset source.

Always commit preset files to source control; the loader only reads from disk and does not fetch remote definitions.

## Root Schema
Every preset JSON must provide the following root object keys:

| Key | Type | Notes |
| --- | ---- | ----- |
| `version` | `string` | Semantic version of the preset. Bumped whenever survey/agents/pipelines change. |
| `meta` | `IndustryPresetMeta` | Human-readable information (id, name, industry, tags, maintainers, release notes). |
| `survey` | `IndustryPresetSurvey` | Ordered sections/questions shown by the brief collector. |
| `agents` | `IndustryPresetAgent[]` | Agent modules copied into the project when the preset is applied. |
| `pipelines` | `IndustryPresetPipeline[]` | Pipeline graphs wired against the preset agents. |
| `postProcessing` | `IndustryPresetPostProcessing` (optional) | Declarative post-processing steps executed after pipelines. |
| `llmAssist` | `IndustryPresetLLMAssist` (optional) | Shared LLM provider hints for agents that rely on `ctx.providers`. |

All nested objects must respect the contracts defined in `app/types/industryPreset.d.ts`. The runtime validator also enforces
allowed keys and value types, so unexpected properties will raise `PRESET_INVALID_SCHEMA` errors during load.

### Survey Sections and Questions
- Sections require stable `id` values and at least one question.
- Supported question `type` values include `text`, `textarea`, `select`, `multiselect`, `boolean`, `number`, `rating`, `email`,
  `channels`, `industry`, and `custom`.
- Choice-based questions (`select`/`multiselect`) need an `options` array containing `id` and `label`. Optional `followUps`
  enable conditional prompts.
- Provide `metadata` objects for renderer-specific hints (e.g., validation rules or layout).

### Agents and Pipelines
When the preset is applied to a project, every agent and pipeline is cloned with project-scoped identifiers and marked with
`source: "preset"`. The entity store persists:
- `originPresetVersion` — preset `version` captured at apply time.
- `presetId`, `presetAgentId`, `presetPipelineId` — allow diffing future preset releases.

Agents may include `config`, `templates`, or arbitrary metadata. Pipelines support custom node/edge metadata; node `config`
should reference preset agent ids (`agentId` or `agentName`). The apply service maps them to project-specific ids.

### Post-processing and LLM Assist
`postProcessing.steps` describe declarative processors invoked after the pipeline run (for example, aggregating summaries). Each
step exposes `id`, `type`, `config`, `enabled`, and `metadata` fields.

`llmAssist` contains shared hints for language models. Populate `providers` with `providerId`, `model`, `mode`, and optional
`temperature`/`maxTokens`. Agents may retrieve this block via the execution context to configure LLM calls consistently.

## Loader Behaviour
`app/core/presets/loader.js` provides three primary helpers:
- `listPresets()` — ensures the directory exists, reads every `*.json`, validates content, and returns lightweight metadata (id,
  version, checksum, description). Invalid files are reported with an `error` flag instead of throwing globally.
- `loadPreset(id)` — loads and validates a single preset, caching the parsed payload keyed by path, modification time, and size to
  avoid redundant disk reads.
- `diffPreset(id, projectPresetVersion)` — compares the latest preset version against a project snapshot and surfaces
  `hasUpdate` plus optional `versionNotes`.

The loader enforces filesystem allowlists via `resolveConfigPath`/`assertAllowedPath`, preventing accidental escapes from the
configuration directory.

## Applying Presets to Projects
`applyPresetToProject({ projectId, presetId })` orchestrates the apply flow:
1. Loads the target project from the entity store.
2. Fetches and validates the preset via the loader.
3. Updates the project with `presetId`, `presetVersion`, `briefVersion`, and clears `presetDraft` suggestions.
4. Deletes existing preset-sourced agents and pipelines for the project.
5. Recreates agents/pipelines with project-scoped ids and `source: "preset"` markers while preserving non-preset entities.
6. Returns the updated project alongside the applied agent/pipeline records.

Consumers can inject a custom entity store (useful for testing) via the optional `entityStore` parameter.

## Versioning and Updates
- Bump the preset `version` whenever survey content, agents, or pipelines change. Include high-level notes in
  `meta.versionNotes`.
- Projects store the applied `presetVersion` and `briefVersion` inside the `Projects` table. These values drive UI diff prompts
  and moderation flows.
- When an LLM or moderator suggests changes, persist them in `project.presetDraft`. Approved updates should re-run
  `applyPresetToProject` with the new preset release.
- The renderer highlights entities with `source: "preset"` so operators know which records will be refreshed on update.

## Authoring Checklist
1. Copy `app/config/industries/generic.json` and adjust ids, names, and survey sections for the target vertical.
2. Validate locally by running `node app/main/db/migrate.js` (ensures schema) and launching the app; the loader will log detailed
   validation errors if the file is malformed.
3. Add tests or fixtures if the preset introduces new agent behaviour.
4. Update documentation or release notes to describe the new preset.

Following this process keeps presets versioned, reproducible, and safe to roll out across projects.
