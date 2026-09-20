# S.C.A.L.E. Strategic Evaluator

Turns a 75-word description of an idea into an evidence-backed strategic thesis:
autonomous research, customer analysis, value-chain mapping, innovation
classification, a six-factor evaluation, recommended experiments, a 90-day plan,
and a branded executive report you can export as an 8.5×11 PDF.

Built to the *S.C.A.L.E. Strategic Evaluator Engineering Build & Launch
Requirements* specification. Section references below point back to that
document.

---

## The V1 promise

**The only required input is a description of at least 75 words.** Industry,
target customer, geography, business model and competitors are all optional; when
they are absent the agent infers them and the report labels exactly which fields
were inferred, so the reader always knows what came from them and what came from
the evaluator (FR-01).

## Quick start

```bash
npm install
cp .env.example .env.local     # optional; defaults work as-is
npm run dev                    # http://localhost:3000
```

Out of the box `SCALE_PROVIDER=mock` runs the whole pipeline — schema validation,
persistence, run progress, all analysis views, the executive template and PDF
export — with **no API key and no network calls**. The fixture data is clearly
marked as such in the report's sources.

To produce real, researched evaluations:

```bash
SCALE_PROVIDER=openai-responses
OPENAI_API_KEY=sk-...
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Schema, repair, scoring and intake tests |

## Architecture

```
Browser
  │  (only description is required)
  ▼
Middleware ─ mints the workspace session cookie
  │
  ▼
Route Handlers (/api/*) ─ validation, rate limiting, tenancy
  │
  ▼
Orchestrator (src/orchestration/runner.ts)
  │   durable run state · retries with backoff · idempotency · bounded concurrency
  ▼
EvaluationProvider (src/agent/*)
  │   mock │ openai-responses │ openai-agent
  ▼
Validation boundary (src/agent/validate.ts)
  │   parse · repair · reject · prune dangling citations
  ▼
Canonical ScaleEvaluation (src/domain/scale-evaluation.ts)
  │   scores.total and recommendation.decision computed HERE, not by the model
  ▼
SQLite (src/data/*) ─ versioned evaluations · normalized evidence · audit log
  │
  ├─▶ Interactive analysis views
  └─▶ ti_scale_executive_v1 ─▶ browser preview · print · Chromium PDF
```

### Design decisions worth knowing

**The web client never depends on model prose.** Every agent response is parsed
and validated against a versioned zod schema before it is persisted or rendered
(§6 engineering rule). The JSON Schema sent to the model is *derived* from that
same zod schema (`src/agent/json-schema.ts`), so the contract the model is asked
to satisfy and the contract the server enforces cannot drift apart.

**The arithmetic is not probabilistic.** `scores.total` and
`recommendation.decision` are deliberately absent from the agent contract and
computed in `src/domain/scoring.ts`. A model-supplied total or decision is
discarded during validation. A recommendation that disagrees with its own
scorecard is worse than no recommendation.

**Structural facts are normalized, not trusted.** Value-chain ordering is
load-bearing for the chain visual, and every individual `order` value can be
schema-valid while the set is broken (all ones, or gaps). So the chain is always
sorted and renumbered contiguously, on every payload, and the array order always
matches `order` — no consumer has to remember to sort.

**Layout is never the model's job.** The PDF is produced by printing the same
report route the user previews, in headless Chromium (§7). Preview and export
cannot diverge because they are the same component tree and the same stylesheet.

**Evidence is not decoration.** Every material claim is typed `evidence` /
`inference` / `hypothesis` with a confidence level and citation metadata, and the
UI renders the type as text rather than colour alone so it survives greyscale
printing and screen readers (FR-09, AC-05).

**Sessions are read-only in render paths.** The workspace cookie is minted in
middleware, because Next.js forbids cookie writes during a Server Component
render — a page that tried would fail for exactly the first-time visitors it was
meant to onboard. `getSession()` reads; `requireSession()` mints and is only used
in Route Handlers.

**Multi-tenant from the first migration.** Every table carries
`organization_id` and every repository read takes it as a parameter, so a
swapped or forged cookie resolves to a different empty workspace rather than to
someone else's data. Retrofitting tenancy costs far more than carrying the
column.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/domain/` | Canonical schema, enumerations, scoring and decision thresholds |
| `src/agent/` | Provider interface, OpenAI adapters, mock provider, prompt, validation |
| `src/orchestration/` | Durable async run execution, retries, progress reporting |
| `src/data/` | SQLite migrations and the only module that speaks SQL |
| `src/components/` | The shared component library used by web, print and PDF |
| `src/report/` | `ti_scale_executive_v1` template, brand config, PDF renderer |
| `src/app/` | Pages and Route Handlers |
| `tests/` | Schema, repair, scoring and intake-gate tests |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/opportunities` | Create an opportunity and start an evaluation (202) |
| `GET` | `/api/opportunities` | List the workspace |
| `GET` | `/api/opportunities/{id}` | Opportunity with every version and run |
| `POST` | `/api/opportunities/{id}/rerun` | New run; prior versions retained |
| `GET` | `/api/runs/{id}` | Progress polling |
| `GET` | `/api/evaluations/{id}/pdf` | 8.5×11 PDF of the executive report |

## Configuration

See `.env.example`. Notable values:

| Variable | Default | Notes |
| --- | --- | --- |
| `SCALE_PROVIDER` | `mock` | `mock`, `openai-responses`, `openai-agent` |
| `OPENAI_API_KEY` | — | Server-side only; never reaches the browser |
| `SCALE_WORKFLOW_ID` | `wf_69db…0650d19df1574b9f7ee` | Agent Builder workflow (§8) |
| `SCALE_MIN_DESCRIPTION_WORDS` | `75` | The intake gate |
| `SCALE_DB_PATH` | `./data/scale.db` | SQLite file |
| `SCALE_RATE_LIMIT_PER_HOUR` | `10` | Per-IP submissions |
| `SCALE_CHROMIUM_PATH` | auto-detect | Override the PDF renderer binary |

## Versioning and governance (§10)

Nothing attached to a completed evaluation is ever overwritten. Each run
persists its own `workflow_version`, `prompt_version`, `schema_version`,
`model_version`, `template_id` and `template_version`, alongside timing, retry
count, token usage, estimated cost, tool-call count, source count and the schema
validation result. A report generated under one configuration stays
interpretable after the product evolves. Reruns append a new version; the UI
exposes the full history and lets you open any prior version or its report.

## What is built, and what is not

Delivered against the launch acceptance criteria (§12):

- **AC-01 … AC-09** — intake, durable async runs with meaningful progress,
  schema-valid persistence with run metadata, every analysis view, the evidence
  layer, per-score rationale, experiments and the 90-day plan, save/reopen/rerun
  without overwriting, and `ti_scale_executive_v1` in-browser and as a 13-page
  8.5×11 PDF with working citations.

Deferred, and why:

- **Authentication (AC-10, §13).** V1 uses a cookie-bound anonymous workspace.
  The identity provider is an open architecture decision; the RBAC hook
  (`canWrite`), roles table and tenant scoping are in place so adding an IdP is
  a contained change rather than a migration.
- **Observability dashboards (AC-11).** All the telemetry AC-11 asks for is
  captured per run in the database; exporting it to metrics/tracing backends
  needs the platform choice from §13.
- **File uploads.** The intake, prompt and provider interface all carry
  `attachments`, but no upload UI or storage backend ships in V1.
- **Accessibility audit (AC-12).** Built to semantic headings, keyboard
  navigation, labelled controls, text-not-colour status encoding and accessible
  tables; a formal audit against the launch browser matrix has not been run.
- **Queue technology (§13).** Runs execute in-process on a bounded concurrency
  pool with a stale-run reaper. `enqueue()` in the orchestrator is the single
  function a hosted queue replaces.

## A note on the mock provider

`SCALE_PROVIDER=mock` exists so the pipeline is demoable and testable without
credentials, and so the fixture cannot drift out of schema conformance without a
test failing. It derives its content deterministically from the description —
the same idea always produces the same report, different ideas produce different
scores — but **it performs no research and its single source is explicitly
labelled a fixture**. Do not mistake its output for analysis.
