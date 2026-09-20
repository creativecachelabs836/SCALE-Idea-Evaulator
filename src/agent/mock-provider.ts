import type { AgentPayload } from '@/domain/scale-evaluation';
import { validateAgentPayload } from './validate';
import { PROMPT_VERSION } from './prompt';
import type {
  EvaluationProvider,
  EvaluationRequest,
  EvaluationResponse,
  ProgressReporter,
} from './types';

/**
 * Deterministic fixture provider.
 *
 * Its job is to exercise every part of the pipeline - schema validation,
 * persistence, the analysis views, the executive template and the PDF - with no
 * API key and no network. It is also what the automated tests assert against,
 * so it must produce a payload that is structurally indistinguishable from a
 * real one.
 *
 * It does NOT attempt to be analytically correct. Content is derived from the
 * submitted description so different ideas yield different reports, but nothing
 * here is researched. Every source it emits is explicitly marked as a fixture.
 */

/** Stable 32-bit hash, so the same description always yields the same report. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
  'that', 'this', 'it', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'our', 'their', 'they', 'we', 'you', 'i', 'my', 'from', 'as', 'into', 'about', 'than',
  'then', 'so', 'if', 'when', 'where', 'which', 'who', 'what', 'how', 'all', 'any', 'each',
  'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'too', 'very',
  'just', 'also', 'its', 'use', 'using', 'used', 'make', 'makes', 'help', 'helps', 'want',
  'need', 'needs', 'idea', 'platform', 'app', 'product', 'service', 'build', 'building',
]);

function keywords(description: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const word of description.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const INDUSTRIES = [
  'B2B software',
  'health technology',
  'financial services technology',
  'logistics and supply chain',
  'climate and energy technology',
  'education technology',
] as const;

const SEGMENT_TEMPLATES = [
  {
    name: 'Early-stage operators',
    job: 'Get a defensible answer fast enough to act on it, without hiring a consultancy.',
    pains: [
      'Decisions are made on anecdote because structured analysis is too slow.',
      'Existing tools produce output that cannot be shown to a board.',
      'No way to revisit why a prior decision was made.',
    ],
    alternatives: ['Spreadsheets and internal memos', 'Boutique strategy consultants', 'Doing nothing'],
    friction: 'Low. There is no incumbent system of record to migrate away from.',
  },
  {
    name: 'Corporate innovation teams',
    job: 'Produce a consistent, comparable evaluation across a portfolio of proposals.',
    pains: [
      'Each proposal arrives in a different shape, so comparison is subjective.',
      'Evidence behind a recommendation is lost once the deck is delivered.',
      'Stage-gate reviews stall waiting for analyst capacity.',
    ],
    alternatives: ['Internal stage-gate templates', 'Big-four advisory engagements', 'Analyst headcount'],
    friction: 'Moderate. Procurement, security review and an existing template standard.',
  },
  {
    name: 'Independent advisors',
    job: 'Deliver client-ready strategic analysis at a margin that survives fixed-fee pricing.',
    pains: [
      'Research and formatting consume the hours that should be billable thinking.',
      'Every engagement rebuilds the same analytical scaffolding.',
      'Brand consistency across deliverables is manual.',
    ],
    alternatives: ['Manual research plus a slide template', 'Junior subcontractors', 'Generic AI chat tools'],
    friction: 'Low. Individually purchased, no procurement cycle.',
  },
] as const;

function buildPayload(request: EvaluationRequest): AgentPayload {
  const seed = hash(request.description);
  const terms = keywords(request.description, 8);
  const primary = terms[0] ?? 'opportunity';
  const secondary = terms[1] ?? 'market';
  const tertiary = terms[2] ?? 'workflow';
  const industry = request.industry ?? pick(INDUSTRIES, seed >> 3);
  const name = request.name ?? `${titleCase(primary)} ${titleCase(secondary)}`;

  // Scores vary with the description so the scorecard, banding and
  // recommendation copy all get exercised across different inputs.
  const scoreFor = (offset: number, floor = 2) =>
    floor + (((seed >> (offset * 3)) & 0xff) % (6 - floor));

  const segments = SEGMENT_TEMPLATES.slice(0, 2 + (seed % 2)).map((tpl, i) => ({
    id: `seg-${i + 1}`,
    name: tpl.name,
    jobToBeDone: tpl.job,
    pains: [...tpl.pains],
    alternatives: [...tpl.alternatives],
    economicValue: `Estimated ${8 + ((seed >> i) % 20)} hours of senior time per evaluation, plus the cost of decisions made without structured evidence.`,
    switchingFriction: tpl.friction,
    confidence: (i === 0 ? 'medium' : 'low') as 'medium' | 'low',
    claimIds: [`clm-${i + 1}`],
  }));

  const inferredFields = [
    !request.industry && 'industry',
    !request.targetCustomer && 'targetCustomer',
    !request.geography && 'geography',
    !request.businessModel && 'businessModel',
    !request.competitors?.length && 'competitors',
    !request.name && 'name',
  ].filter((f): f is string => Boolean(f));

  return {
    opportunity: {
      name,
      description: request.description,
      industry,
      targetCustomer: request.targetCustomer ?? segments[0].name,
      geography: request.geography ?? 'North America and Western Europe',
      businessModel: request.businessModel ?? 'Seat-based SaaS subscription with usage-based overage',
      competitors: request.competitors ?? ['Incumbent suite vendor', 'Generic AI assistant', 'Manual spreadsheet process'],
      inferredFields,
    },
    executiveSummary: {
      problem: `Teams working on ${primary} decisions commit budget before anyone has assembled the evidence that would justify it. The analysis that should precede the commitment is slow, inconsistent, and discarded once the decision is made.`,
      targetCustomer: `${segments[0].name} operating in ${industry}, who need a defensible answer in days rather than the weeks a consulting engagement requires.`,
      strategicThesis: `The wedge is speed at an acceptable depth. By making a structured ${primary} evaluation cheap enough to run before a decision rather than after it, the offering serves a volume of decisions incumbents cannot economically reach. Durable advantage accrues from the accumulated corpus of prior evaluations and their outcomes, not from the analysis engine itself.`,
      whyNow: `Three conditions have converged: research and synthesis costs have fallen sharply, ${secondary} buyers now accept machine-generated analysis when its evidence is inspectable, and pressure on ${tertiary} budgets has raised the cost of an unexamined bet.`,
      recommendationSummary: `The market case is stronger than the defensibility case. Proceed, but treat proprietary evaluation data and workflow integration as the assumptions to test first.`,
    },
    customerSegments: segments,
    market: {
      dynamics: [
        {
          title: 'Analysis supply is being repriced',
          detail: `The marginal cost of producing structured ${primary} analysis has fallen faster than the price buyers expect to pay, opening a gap between what incumbents charge and what the work now costs to deliver.`,
          confidence: 'medium' as const,
          claimIds: ['clm-1'],
        },
        {
          title: 'Buyers demand inspectable reasoning',
          detail: 'Procurement and risk functions increasingly require that machine-generated analysis expose its sources and separate evidence from inference before it can inform a funded decision.',
          confidence: 'medium' as const,
          claimIds: ['clm-2'],
        },
      ],
      trends: [
        {
          title: 'Consolidation of point tools into decision workflows',
          detail: `Standalone ${tertiary} utilities are being absorbed into systems of record. A tool that produces an artifact but owns no workflow is structurally exposed.`,
          confidence: 'medium' as const,
          claimIds: ['clm-3'],
        },
      ],
      risks: [
        {
          title: 'Foundation-model commoditization',
          detail: 'If general-purpose assistants reach acceptable quality on structured strategic analysis, the analytical layer loses its premium and only the data and workflow layers retain value.',
          confidence: 'high' as const,
          claimIds: ['clm-4'],
        },
        {
          title: 'Trust deficit on high-stakes decisions',
          detail: 'Buyers may accept machine analysis for screening but refuse it for committing capital, capping the offering at low-value decisions.',
          confidence: 'medium' as const,
          claimIds: [],
        },
      ],
      opportunities: [
        {
          title: 'Portfolio comparison across evaluations',
          detail: 'Once several evaluations exist for one organization, comparing them becomes a capability no single-shot analysis tool can match.',
          confidence: 'medium' as const,
          claimIds: [],
        },
      ],
    },
    valueChain: [
      {
        id: 'vc-1',
        order: 1,
        name: 'Idea capture',
        participants: ['Founders', 'Product managers', 'Innovation leads'],
        customerPain: 'Ideas arrive as prose in unstructured channels and are never framed consistently.',
        valueCreated: 'A structured, comparable statement of the opportunity.',
        valueCaptured: 'Minimal today; treated as free intake.',
        technologyDependencies: ['Web intake', 'Document parsing'],
        controlLevel: 'high' as const,
        opportunitySignals: ['No incumbent owns this step', 'Natural entry point for the workflow'],
      },
      {
        id: 'vc-2',
        order: 2,
        name: 'Research and evidence assembly',
        participants: ['Analysts', 'Research vendors', 'Data providers'],
        customerPain: 'The most expensive step, and the first one cut when time is short.',
        valueCreated: 'Sourced market, competitor and customer evidence.',
        valueCaptured: 'High. This is what consultancies and data vendors bill for.',
        technologyDependencies: ['Web research', 'Source normalization', 'Citation retention'],
        controlLevel: 'medium' as const,
        opportunitySignals: ['Cost structure has changed faster than pricing', 'Evidence provenance is weakly served'],
      },
      {
        id: 'vc-3',
        order: 3,
        name: 'Synthesis and evaluation',
        participants: ['Strategy consultants', 'Internal strategy teams'],
        customerPain: 'Quality depends entirely on who happens to be assigned.',
        valueCreated: 'A scored, reasoned position on the opportunity.',
        valueCaptured: 'High, and currently tied to billable hours.',
        technologyDependencies: ['Structured evaluation model', 'Scoring rubric'],
        controlLevel: 'high' as const,
        opportunitySignals: ['Rubric consistency is a genuine differentiator', 'Directly substitutes billable work'],
      },
      {
        id: 'vc-4',
        order: 4,
        name: 'Executive communication',
        participants: ['Design teams', 'Presentation tooling', 'Advisors'],
        customerPain: 'Formatting consumes hours that should have gone into thinking.',
        valueCreated: 'A board-ready artifact.',
        valueCaptured: 'Moderate, usually bundled into the engagement fee.',
        technologyDependencies: ['Template system', 'PDF rendering'],
        controlLevel: 'high' as const,
        opportunitySignals: ['Deterministic rendering is cheap to own', 'Brand fidelity is a retention lever'],
      },
      {
        id: 'vc-5',
        order: 5,
        name: 'Decision and execution tracking',
        participants: ['Leadership', 'PMO', 'Portfolio management tools'],
        customerPain: 'The reasoning behind a decision is lost as soon as the decision is made.',
        valueCreated: 'Traceability from decision back to evidence.',
        valueCaptured: 'Low today, high strategically.',
        technologyDependencies: ['Versioning', 'Workspace permissions', 'Audit trail'],
        controlLevel: 'medium' as const,
        opportunitySignals: ['This is where switching costs are created', 'Weakest coverage in the current chain'],
      },
    ],
    competitors: [
      {
        id: 'cmp-1',
        name: 'Global strategy consultancies',
        type: 'incumbent' as const,
        customerServed: 'Enterprises making large, infrequent, high-stakes commitments.',
        valueChainPosition: 'Own research, synthesis and executive communication end to end.',
        advantage: 'Institutional trust, senior relationships, accountability a vendor cannot offer.',
        strategicSignal: 'Their economics prevent them from serving small or frequent decisions, which is where the entry wedge sits.',
        claimIds: ['clm-3'],
      },
      {
        id: 'cmp-2',
        name: 'General-purpose AI assistants',
        type: 'substitute' as const,
        customerServed: 'Anyone willing to prompt their way to an answer.',
        valueChainPosition: 'Compete directly at synthesis; absent everywhere else.',
        advantage: 'Zero marginal cost, enormous distribution, improving rapidly.',
        strategicSignal: 'The single most serious competitive threat. Differentiation must come from structure, evidence provenance and persistence rather than from generation quality.',
        claimIds: ['clm-4'],
      },
      {
        id: 'cmp-3',
        name: 'Innovation management suites',
        type: 'challenger' as const,
        customerServed: 'Corporate innovation functions with an existing stage-gate process.',
        valueChainPosition: 'Own intake and tracking; weak on research and synthesis.',
        advantage: 'Already deployed, already integrated, already in the budget.',
        strategicSignal: 'The most likely acquirer, and the most likely fast follower on the analysis layer.',
        claimIds: [],
      },
    ],
    innovation: {
      // Deliberately resists the default: most ideas of this shape are sustaining.
      classification: seed % 3 === 0 ? ('potentially_disruptive' as const) : ('sustaining' as const),
      rationale:
        seed % 3 === 0
          ? 'Classified as potentially disruptive because the offering serves decisions that incumbents decline on economic grounds rather than capability grounds. Consultancies cannot profitably evaluate a two-week decision, so those decisions currently go unevaluated. Serving non-consumption at a lower price point, on a cost structure incumbents would have to damage their own margins to match, is the disruptive pattern.'
          : 'Classified as sustaining despite being technology-led. The offering serves customers who are already buying strategic analysis, competes on quality and speed within the existing definition of the job, and does not create a new economic model that incumbents are structurally unable to copy. This is a better and faster version of work that is already being purchased. That is a sustaining innovation, and it is not a criticism: sustaining innovations sold into an established budget line have a shorter path to revenue.',
      entryMechanism: `Enter through ${segments[0].name.toLowerCase()} who feel the pain most acutely and carry the least procurement friction, then expand into larger accounts on the strength of accumulated evaluation history.`,
    },
    disruptionPath: {
      edge: {
        customer: `${segments[0].name} making decisions too small to justify an analyst.`,
        capability: 'Fast, structured, evidence-tagged evaluation from a minimal input.',
        economicAdvantage: 'Marginal cost per evaluation is a rounding error against an analyst day.',
        evidence: 'Fixture data. In a live run this stage cites retrieved sources on incumbent pricing and engagement minimums.',
        assumptions: ['Buyers will accept machine analysis for screening decisions', 'A short description carries enough signal to be useful'],
        risks: ['Output is judged shallow and the account never expands', 'Screening decisions turn out to carry no budget'],
      },
      improve: {
        customer: 'The same buyers, now applying the tool to progressively more consequential decisions.',
        capability: 'Deeper research, source quality controls, and accumulated rubric calibration.',
        economicAdvantage: 'Quality rises while unit cost stays flat, which is not true of an analyst.',
        evidence: 'Fixture data.',
        assumptions: ['Quality improvements are visible to the buyer', 'Evidence provenance is what builds trust'],
        risks: ['General assistants improve faster than the specialized rubric', 'Trust gains do not transfer to higher-stakes decisions'],
      },
      climb: {
        customer: 'Corporate innovation and strategy functions running portfolios of proposals.',
        capability: 'Cross-evaluation comparison, workspace collaboration, and stage-gate integration.',
        economicAdvantage: 'The accumulated corpus of prior evaluations becomes the reason to stay.',
        evidence: 'Fixture data.',
        assumptions: ['Portfolio comparison is valuable enough to pay more for', 'Organizations will centralize evaluations in one system'],
        risks: ['Incumbent suites ship comparison first', 'Enterprise security review stalls expansion'],
      },
      rewrite: {
        customer: 'Leadership treating evaluation as a continuous capability rather than an event.',
        capability: 'Decision system of record linking every commitment to its evidence and outcome.',
        economicAdvantage: 'Outcome data closes the loop and calibrates future evaluations, which no new entrant can replicate on day one.',
        evidence: 'Fixture data.',
        assumptions: ['Organizations will record decision outcomes honestly', 'Calibration measurably improves recommendations'],
        risks: ['Outcome data is too sparse and too lagged to calibrate anything', 'The category settles as a feature of an existing suite'],
      },
    },
    scores: {
      marketAttractiveness: {
        score: scoreFor(0, 2),
        rationale: `${titleCase(industry)} buyers already fund strategic analysis, so no new budget line has to be created. Growth is real but the segment is crowded, and pricing power depends on evidence quality rather than on the analysis itself.`,
        claimIds: ['clm-1'],
      },
      customerPain: {
        score: scoreFor(1, 3),
        rationale: 'The pain is frequent and economically material - senior hours consumed on work that is discarded - but it is tolerated rather than urgent, which lengthens the sales cycle.',
        claimIds: ['clm-2'],
      },
      edgeStrength: {
        score: scoreFor(2, 2),
        rationale: 'The entry wedge is well chosen: an underserved class of decision, a buyer with no procurement friction, and a cost structure incumbents cannot match. It is narrow, which is what a wedge should be.',
        claimIds: [],
      },
      valueChainLeverage: {
        score: scoreFor(3, 2),
        rationale: 'The offering can own intake, synthesis and communication outright, but the research node depends on upstream sources and the tracking node is held by existing systems of record.',
        claimIds: ['clm-3'],
      },
      defensibility: {
        score: scoreFor(4, 1),
        rationale: 'The weakest dimension. The analytical engine is rented from a model provider and reproducible by a competent team in weeks. Defensibility exists only in the accumulated evaluation corpus and workflow integration, neither of which exists at launch.',
        claimIds: ['clm-4'],
      },
      speedToMarket: {
        score: scoreFor(5, 3),
        rationale: 'No regulatory gate, no hardware, no data partnership required. A usable version can be in front of buyers within a quarter, and the core assumptions are cheap to test.',
        claimIds: [],
      },
    },
    claims: [
      {
        id: 'clm-1',
        statement: 'The cost of producing structured strategic analysis has fallen faster than its market price.',
        type: 'inference' as const,
        confidence: 'medium' as const,
        sourceIds: ['src-1'],
        section: 'Market Context',
      },
      {
        id: 'clm-2',
        statement: 'Buyers require inspectable sourcing before machine-generated analysis can inform a funded decision.',
        type: 'inference' as const,
        confidence: 'medium' as const,
        sourceIds: ['src-1'],
        section: 'Market Context',
      },
      {
        id: 'clm-3',
        statement: 'Incumbent consultancies cannot profitably serve small, frequent decisions.',
        type: 'hypothesis' as const,
        confidence: 'medium' as const,
        sourceIds: [],
        section: 'Competitive Landscape',
      },
      {
        id: 'clm-4',
        statement: 'General-purpose assistants will reach acceptable quality on structured strategic analysis within 24 months.',
        type: 'hypothesis' as const,
        confidence: 'low' as const,
        sourceIds: [],
        section: 'Market Context',
      },
    ],
    hypotheses: [
      {
        id: 'hyp-1',
        statement: `${segments[0].name} will pay for a structured evaluation they currently skip entirely.`,
        criticality: 'high' as const,
        linkedClaimIds: ['clm-3'],
      },
      {
        id: 'hyp-2',
        statement: 'Evidence provenance, not analysis quality, is what converts a trial into a paid account.',
        criticality: 'high' as const,
        linkedClaimIds: ['clm-2'],
      },
      {
        id: 'hyp-3',
        statement: 'A 75-word description carries enough signal to produce an evaluation the buyer judges credible.',
        criticality: 'high' as const,
        linkedClaimIds: [],
      },
    ],
    experiments: [
      {
        id: 'exp-1',
        hypothesisId: 'hyp-1',
        experiment: 'Offer a paid single evaluation to 40 qualified prospects with no free tier and no discount.',
        successMetric: 'At least 8 paid purchases (20% conversion) within three weeks.',
        costEffort: 'low' as const,
        durationDays: 21,
        nextDecision: 'Below 10% conversion, revisit the segment before building further.',
      },
      {
        id: 'exp-2',
        hypothesisId: 'hyp-2',
        experiment: 'A/B the report with and without the evidence/inference/hypothesis layer exposed.',
        successMetric: 'Materially higher trust rating and repeat-use rate in the variant showing provenance.',
        costEffort: 'low' as const,
        durationDays: 14,
        nextDecision: 'If provenance does not move trust, redirect that investment into research depth.',
      },
      {
        id: 'exp-3',
        hypothesisId: 'hyp-3',
        experiment: 'Have three independent strategy practitioners blind-score 15 generated evaluations against analyst-written baselines.',
        successMetric: 'Median rating within one point of the human baseline on usefulness.',
        costEffort: 'medium' as const,
        durationDays: 28,
        nextDecision: 'A gap wider than two points means the intake needs more than a description.',
      },
    ],
    ninetyDayPlan: {
      validate: {
        focus: 'Days 1-30 - confirm the pain and the willingness to pay before building anything further.',
        milestones: [
          'Run 25 structured interviews across the two primary segments.',
          'Execute the paid-evaluation test (exp-1).',
          'Establish an evidence-quality baseline against analyst-written reports.',
        ],
        exitCriteria: 'Documented willingness to pay from at least 8 buyers, with recorded objections.',
      },
      prototype: {
        focus: 'Days 31-60 - narrow to one segment and one decision type, and build only what that requires.',
        milestones: [
          'Ship the evaluation and report flow to a closed pilot group.',
          'Instrument which report sections are actually read and exported.',
          'Run the provenance A/B test (exp-2).',
        ],
        exitCriteria: 'Ten pilot users completing an evaluation unprompted in a single week.',
      },
      prove: {
        focus: 'Days 61-90 - demonstrate retention and the beginning of a defensibility story.',
        milestones: [
          'Convert pilot users to paid accounts.',
          'Ship portfolio comparison across saved evaluations.',
          'Complete the blind quality benchmark (exp-3).',
        ],
        exitCriteria: 'Repeat usage from a majority of paid accounts and a defensible quality benchmark.',
      },
    },
    sources: [
      {
        id: 'src-1',
        title: 'Fixture source - no live research was performed for this run',
        publisher: 'S.C.A.L.E. mock provider',
        sourceType: 'other' as const,
        retrievedAt: new Date().toISOString(),
        excerpt:
          'This evaluation was produced by the deterministic fixture provider. It exercises the full pipeline without calling a model and without performing research. Configure SCALE_PROVIDER=openai-responses with a valid OPENAI_API_KEY for evidence-backed output.',
      },
    ],
    recommendation: {
      headline: `${name}: a credible wedge with an unresolved defensibility question.`,
      topOpportunity: 'Owning the evaluation record itself - the accumulated corpus of prior evaluations and their outcomes - rather than the act of generating any single analysis.',
      greatestRisk: 'General-purpose assistants reaching acceptable quality before enough proprietary evaluation history has accumulated to matter.',
      criticalAssumption: `${segments[0].name} will pay for a structured evaluation of decisions they currently make without one.`,
      nextExperiment: 'The paid-evaluation test (exp-1): 40 qualified prospects, no free tier, three weeks.',
      nextDecisionDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      rationale:
        'The market and speed dimensions carry this opportunity; defensibility drags it. The scorecard reflects a real business with a real entry point whose long-term position depends entirely on converting early usage into proprietary data. Fund the validation work, not the platform.',
    },
  };
}

async function evaluate(
  request: EvaluationRequest,
  onProgress: ProgressReporter,
): Promise<EvaluationResponse> {
  const started = Date.now();

  // Walk the progress stages so the client's polling and the progress UI are
  // exercised exactly as they would be against a live provider.
  for (let stage = 0; stage < 9; stage++) {
    if (request.signal?.aborted) throw new Error('Evaluation cancelled.');
    onProgress(stage);
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  // Round-trip through the real validator so the fixture cannot drift out of
  // conformance with the canonical schema without a test failing.
  const result = validateAgentPayload(buildPayload(request));

  return {
    payload: result.payload,
    usage: { inputTokens: 0, outputTokens: 0, toolCallCount: 0, estimatedCostUsd: 0 },
    modelVersion: 'mock-fixture-1',
    workflowVersion: `mock:${PROMPT_VERSION}`,
    repaired: result.repaired,
    repairNotes: [
      `Generated by the deterministic fixture provider in ${Date.now() - started}ms. No research performed.`,
      ...result.repairNotes,
    ],
  };
}

export const mockProvider: EvaluationProvider = { name: 'mock', evaluate };
export { buildPayload as buildMockPayload };
