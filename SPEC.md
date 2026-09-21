# S.C.A.L.E. Strategic Evaluator — Specification

> **This is a working document.** It is meant to be edited as we learn. When an
> iteration teaches us something the spec got wrong, we change the spec in the
> same commit as the code. A spec that only ever gets appended to is a wish list,
> not a plan.

**Status:** Iteration 0 complete. Iteration 1 is next.
**Source:** Derived from *S.C.A.L.E. Strategic Evaluator — Engineering Build &
Launch Requirements* (Creative Cache Labs / Tech Intuitions). Section references
below like `§6` point back to that document.

---

## 1. Product thesis

The S.C.A.L.E. Strategic Evaluator turns an early product idea into an
evidence-backed strategic thesis, by combining autonomous research, customer
analysis, value-chain mapping, innovation classification, hypothesis management
and structured evaluation.

It exists so that product managers, founders and innovation teams can evaluate
an opportunity **before** committing significant engineering or capital, and can
revisit the reasoning later instead of losing it the moment the decision is made.

> Build this as a structured intelligence platform — not a chat interface with a
> PDF button.

### The one promise

**A user writes at least 75 words describing their idea. That is the only
required input.**

Everything else — industry, target customer, geography, business model,
competitors — is optional, and inferred when absent. Anything inferred is
labelled as inferred in the output, so the reader always knows what came from
them and what came from the evaluator.

This constraint is the product. Every iteration is judged against it.

---

## 2. Principles

These are the non-negotiables. They came out of building a full version of this
once already; each one is here because violating it produced a real defect.

**P1 — The schema is the contract.**
The client never depends on free-form model prose. Model output is parsed and
validated against a versioned schema before it is persisted or rendered.
Anything unrepairable is rejected. (§6 engineering rule)

**P2 — The arithmetic is not probabilistic.**
The total score and the recommendation are computed from the six dimensions in
our own code, never taken from the model, and a model-supplied value is
discarded. A recommendation that disagrees with its own scorecard is worse than
no recommendation.

**P3 — Structural facts are normalized, not trusted.**
Where a set of values must hold together — value-chain ordering, cross-references
between claims and sources — validate the *set*, not just each member. Every
individual value can be legal while the whole is broken.

**P4 — Evidence is typed, and typed visibly.**
Every material claim is `evidence`, `inference` or `hypothesis`, with a
confidence level and citation metadata. The distinction is rendered as text, not
colour alone, so it survives greyscale printing and screen readers. A report
where everything is high-confidence evidence is a broken report. (§FR-09)

**P5 — Layout is never the model's job.**
Report rendering is deterministic. The model supplies content; our template
decides layout. Preview and export are the same component tree, so they cannot
diverge. (§7)

**P6 — The product must be demoable without credentials.**
A deterministic fixture provider exercises the entire pipeline with no API key
and no network. It performs no research and says so loudly. It is also what the
tests run against, so the fixture cannot drift out of schema conformance without
a test failing.

**P7 — Tests sweep the input space, not one happy example.**
A previous version crashed on roughly half of all inputs while its whole test
suite passed, because every test description happened to fall on one side of a
hash boundary. Where behaviour is derived from input, test across many inputs.

**P8 — Be willing to conclude the idea is weak.**
An evidence-backed RECONSIDER is a more valuable product than a flattering
INVEST. The methodology must resist the pull toward telling users what they want
to hear — in particular, a technology-led idea is not automatically disruptive.

---

## 3. The S.C.A.L.E. methodology

The domain substance the product implements. This is what makes it a strategy
tool rather than a summarizer.

### Five pillars (§2)

| Pillar | Intent | Where it lands |
| --- | --- | --- |
| **S**trategic Vision | Customer segments, their value chain, opportunities for value delivery | Segmentation, value-chain map, opportunity thesis |
| **C**ontext | Market dynamics, trends, technical and business dimensions, unmet needs | Market research, industry signals, competitive context |
| **A**lignment | Stakeholder alignment across customers, enablers, leadership, teams | Future module; architecture must allow shared workspaces |
| **L**earning | Experimentation and feedback that reduce risk | Hypotheses, experiments, confidence, validation status |
| **E**xecution | Lean 90-day / monthly / weekly cycles with transparent progress | 90-day action plan |

### The analytical pipeline

1. **Understand the idea.** Extract or infer name, industry, target customer,
   geography, business model. Record every inferred field.
2. **Research.** Industry structure, named incumbents and challengers, market
   dynamics, technology shifts, regulatory considerations, growth signals. Every
   source retained with title, URL, publisher, retrieval timestamp. Never invent
   a source.
3. **Customer analysis.** 2–4 distinct segments, each with job to be done,
   specific pains, current alternatives, economic value at stake, switching
   friction. Segment by the job, not by firmographics alone. (§FR-04)
4. **Value chain.** Ordered chain from raw input to end customer, typically 4–7
   nodes. Per node: participants, customer pain, value created, value captured,
   technology dependencies, realistic control level, opportunity signals.
   (§FR-05)
5. **Innovation classification.** `sustaining` or `potentially_disruptive`, and
   defend it. Most good ideas are sustaining innovations sold to well-served
   customers, and saying so is the more useful answer. Classify as disruptive
   only when the offering serves customers incumbents overshoot or ignore, on an
   economic model incumbents would have to damage their own business to copy.
   (§FR-06)
6. **Disruption path.** Four stages — Enters at the Edge → Improves Quietly →
   Climbs the Value Chain → Rewrites the Value Chain. Per stage: customer,
   capability, economic advantage, evidence, assumptions, risks. For a sustaining
   idea, describe the realistic expansion path through the same stages rather
   than forcing a disruption narrative. (§FR-07)
7. **Evidence discipline.** Every material assertion becomes a typed claim (P4).
   With a 75-word input and no uploads, most claims about the *specific idea*
   will be inference or hypothesis; most claims about the *market* should be
   evidence.
8. **Score.** Six dimensions, 1–5, full range used, each anchored in its
   rationale and linked to supporting claims.
9. **Learning.** Critical assumptions → hypotheses → experiments runnable in
   under 90 days, each with success metric, cost/effort, duration, and the
   decision the result unlocks. (§FR-10)
10. **Execution.** 90-day plan: days 1–30 Validate, 31–60 Prototype, 61–90 Prove.

### The six scoring dimensions (§FR-08)

| Dimension | Anchored in |
| --- | --- |
| Market Attractiveness | Size, growth, margin structure, timing |
| Customer Pain | Frequency, severity, economic impact |
| Edge Strength | Quality of the entry wedge |
| Value-Chain Leverage | Control and economic position of the node attacked |
| Defensibility | Whether the advantage compounds or erodes |
| Speed to Market | Feasibility and testability in the near term |

**Total /30. Recommendation bands: 24–30 INVEST · 18–23 REFINE · below 18
RECONSIDER.**

These bands are product heuristics, not predictions. The UI must present the
rationale and evidence alongside the score and state plainly that this is
decision support, not a prediction of product success. (§6)

### Core enumerations (§6)

| Field | Values |
| --- | --- |
| `claim.type` | `evidence` · `inference` · `hypothesis` |
| `confidence` | `high` · `medium` · `low` |
| `innovation.classification` | `sustaining` · `potentially_disruptive` |
| `recommendation.decision` | `INVEST` · `REFINE` · `RECONSIDER` |
| `run.status` | `queued` · `researching` · `synthesizing` · `mapping` · `evaluating` · `rendering` · `completed` · `failed` |

---

## 4. Iteration roadmap

Each iteration is small enough to review in one sitting and ends with something
you can actually look at. **Out of scope is as binding as in scope** — it is what
stops an iteration from quietly becoming the whole app again.

---

### Iteration 0 — Foundation ✅

**Goal:** A repository you can clone, launch and test, with the plan written
down.

**In scope:** README, this spec, minimal Next.js skeleton that serves one page,
test harness, launch script, TypeScript strict mode.

**Out of scope:** Any domain logic whatsoever.

**Acceptance:**
- [x] `./scripts/launch.sh` takes a fresh clone to a running app
- [x] `npm test` runs and passes
- [x] `npm run typecheck` and `npm run build` are clean
- [x] The spec describes iterations 1–7

**Demo:** The landing page states the promise and the current iteration.

---

### Iteration 1 — The evaluation contract

**Goal:** The canonical data model exists and is provably correct, in isolation.

**Why first:** Everything downstream depends on it, and it is far cheaper to get
right with no UI, no database and no model in the way.

**In scope:**
- `ScaleEvaluation` schema: opportunity, executive summary, customer segments,
  market, value chain, competitors, innovation, disruption path, scores, claims,
  hypotheses, experiments, 90-day plan, sources, recommendation
- The enumerations in §3
- Scoring: total computed from the six dimensions; decision derived from bands (P2)
- Validation with structural repair, and rejection of the unrepairable (P1)
- Cross-set normalization: value-chain ordering, dangling citation pruning (P3)

**Out of scope:** UI, persistence, any model call, the report.

**Acceptance:**
- [ ] A valid payload validates; each required section missing causes rejection
- [ ] An out-of-range score is rejected, not clamped
- [ ] A model-supplied `total` or `decision` is discarded
- [ ] Value-chain ordering is normalized even when every value is individually legal
- [ ] Citations pointing at unknown sources are pruned
- [ ] Decision bands are correct at every boundary (17/18, 23/24)

**Demo:** `npm test` — the contract is the test suite.

---

### Iteration 2 — See the output

**Goal:** A full evaluation rendered on screen, from a fixture. The first time
the product is visible.

**In scope:** Deterministic fixture provider (P6); the analysis component
library — segments, market, value chain, disruption path, scorecard, evidence
layer, experiments, 90-day plan, recommendation; design tokens from the brand
system; a route that renders a fixture evaluation.

**Out of scope:** Intake, model calls, persistence, PDF.

**Acceptance:**
- [ ] Every schema section has a component that renders it
- [ ] Claim type and confidence are visible as text, not colour alone (P4)
- [ ] The scorecard shows each score with its rationale and total /30
- [ ] The decision disclaimer is present
- [ ] The fixture round-trips through the real validator (P6)
- [ ] Readable at phone width; headings semantic; tables have headers

**Demo:** Open the app, see a complete strategic thesis.

---

### Iteration 3 — Intake

**Goal:** Your idea, your evaluation. The 75-word promise, end to end, still on
fixture data.

**In scope:** The intake form with live word count; the 75-word gate enforced on
the server with the same rule the client shows; optional-context fields,
collapsed by default; submit → evaluation rendered for that idea; inferred-field
labelling.

**Out of scope:** Model calls, persistence, async runs.

**Acceptance:**
- [ ] Description is the only required field
- [ ] Under 75 words cannot be submitted; the server rejects it independently
- [ ] Fields the user left blank are shown as inferred
- [ ] Different descriptions produce different evaluations (P7: verified across many inputs)

**Demo:** Type 75 words about a real idea, get a thesis back.

---

### Iteration 4 — Real intelligence

**Goal:** Replace the fixture with actual research and analysis.

**In scope:** Provider interface behind a server-side abstraction (§7); an LLM
adapter with structured output and web search; the methodology from §3 encoded
as a versioned prompt; validation boundary applied to live output; sources and
typed claims populated from real research; the fixture provider retained as the
no-credentials path.

**Out of scope:** Persistence, async runs, PDF.

**Acceptance:**
- [ ] A real idea produces a researched evaluation with citable sources
- [ ] Provider selection is configuration; the UI is unaware of which is in use
- [ ] Malformed model output is repaired or rejected, never rendered
- [ ] Credentials are server-side only
- [ ] Claim type distribution is realistic, not uniformly high-confidence evidence (P4)
- [ ] A plainly weak idea scores as weak (P8)

**Demo:** Submit an idea, get analysis citing real, checkable sources.

---

### Iteration 5 — Durability

**Goal:** Evaluations survive, can be revisited, and long runs do not block.

**In scope:** Persistence; durable asynchronous run state with the progress
stages from §3; polling rather than held-open requests; retries with backoff;
idempotency; save / reopen / rerun with versions never overwritten; per-run
provenance — workflow, prompt, schema and model versions, timing, usage, cost,
validation result (§10).

**Out of scope:** Auth, multi-user, PDF.

**Acceptance:**
- [ ] A submitted evaluation is retrievable after a restart
- [ ] Progress is visible and meaningful while a run is in flight
- [ ] A rerun adds a version; prior versions remain openable
- [ ] No run can end without a terminal state
- [ ] A completed evaluation's configuration is never mutated afterward

**Demo:** Submit, close the tab, come back, rerun, compare versions.

---

### Iteration 6 — The executive report

**Goal:** The shareable artifact — `ti_scale_executive_v1`.

**In scope:** The 14 report sections (§5); the brand design system — navy
`#243F56`, cyan `#19B9D8`, teal `#22B7B0`, Inter, generous white space; browser
preview, print, and 8.5×11 PDF from the same component tree (P5); branding as
template configuration, not page-specific styles.

**Out of scope:** White-label variants, visual regression tests.

**Acceptance:**
- [ ] All 14 sections render
- [ ] Preview pagination matches the PDF exactly
- [ ] PDF is US Letter portrait with stable pagination and a running footer
- [ ] Citations are live links in both browser and PDF
- [ ] Re-skinning needs no change to the evaluation data model

**Demo:** Download a report you would show a board.

---

### Iteration 7 — Production

**Goal:** Something real users can use, at a URL.

**In scope:** Authentication and organization boundaries; RBAC; rate limiting
and abuse controls; secrets management; observability — run success rate,
latency, errors, cost; backup and recovery; accessibility pass against the
launch browser matrix; deployment.

**Out of scope:** Portfolio comparison, collaboration, white-label, custom data
sources — all post-launch.

**Acceptance:**
- [ ] Users sign in; one organization cannot read another's evaluations
- [ ] Operational dashboards expose run success, latency, errors and cost
- [ ] Deployed and reachable at a stable URL
- [ ] Accessibility and browser compatibility checks pass

**Demo:** Send someone the link.

---

## 5. Decision log

Decisions we have actually made, with the reasoning, so we do not relitigate
them by accident.

| # | Decision | Reasoning |
| --- | --- | --- |
| D1 | Next.js + TypeScript, strict mode | §7's suggested direction; lets one component set serve web, print and PDF (P5) |
| D2 | The description gate is a 75-word **minimum**, capped at 500 | "At least 75 words" is the product promise; the cap keeps prompts bounded. Configurable |
| D3 | Total and decision computed server-side | P2 |
| D4 | A deterministic fixture provider ships permanently, not as scaffolding | P6 — it is the demo path and the test fixture |
| D5 | Iterations are sliced by *visible capability*, not by architectural layer | An iteration that ships no visible change cannot be reviewed meaningfully |

## 6. Open decisions

Deliberately unresolved. Each names when it must be settled.

| # | Question | Needed by | Notes |
| --- | --- | --- | --- |
| O1 | **Persistence engine** | Iteration 5 | A local file database is simplest but will not survive a serverless deploy. If the target is serverless, this must be a managed database instead. Depends on O3 |
| O2 | **Authentication** | Iteration 7 | Identity provider, organization model, RBAC shape, enterprise SSO roadmap (§13) |
| O3 | **Deployment target** | Iteration 5 | Container host keeps persistence and PDF rendering simple; serverless requires a managed database and an external renderer. **This one constrains O1 and the report renderer, so deciding it early is worth more than deciding it well later** |
| O4 | **Model provider and invocation path** | Iteration 4 | §8 names an Agent Builder workflow; the exact invocation interface is listed as an open decision in §13. Keep it behind one replaceable function |
| O5 | **Async orchestration** | Iteration 5 | In-process pool vs hosted queue; retry semantics, idempotency, cancellation |
| O6 | **Research governance** | Iteration 4 | Approved source types, freshness policy, prompt-injection controls for retrieved content |
| O7 | **Data retention** | Iteration 7 | Retention and deletion for prompts, uploads, agent output, sources, reports |

---

## 7. How we work

1. **Pick the next iteration.** Usually the next number; not always.
2. **Adjust its scope before starting.** Cheapest moment to change our minds.
3. **Build it**, with its acceptance criteria as the definition of done.
4. **Review it running**, not just as a diff.
5. **Update this spec** in the same commit — tick the criteria, record decisions
   in §5, retire or add open questions in §6.

An iteration is finished when its acceptance criteria are ticked *and* the spec
reflects what we learned. If an iteration turns out to be too big, split it and
write down why — that is data about how we are estimating.
