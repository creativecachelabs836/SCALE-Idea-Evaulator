import { z } from 'zod';
import {
  ClaimType,
  CompetitorType,
  Confidence,
  ControlLevel,
  CostEffort,
  Criticality,
  Decision,
  InnovationClassification,
  SourceType,
} from './enums';

/**
 * Canonical S.C.A.L.E. data model (spec section 6).
 *
 * Two layers live here:
 *   1. `AgentPayloadSchema` - what the model is contractually required to
 *      return. This is the validation boundary; free-form prose never reaches
 *      the client.
 *   2. `ScaleEvaluationSchema` - the persisted object: the agent payload plus
 *      the identity, versioning and provenance envelope required by section 10.
 */

export const SCHEMA_VERSION = '1.0.0';
export const TEMPLATE_ID = 'ti_scale_executive_v1';
export const TEMPLATE_VERSION = '1.0';
export const PROMPT_VERSION = 'scale-thesis-v1';

const nonEmpty = (max = 4000) => z.string().trim().min(1).max(max);
const bullets = (max = 24) => z.array(nonEmpty(600)).max(max);

/** A 1-5 score that must carry its own reasoning. Spec section 6 scoring rule. */
const ScoredDimension = z.object({
  score: z.number().int().min(1).max(5),
  rationale: nonEmpty(1500),
  /** Claim ids backing this score, so the UI can show evidence beside it. */
  claimIds: z.array(z.string()).max(12).default([]),
});
export type ScoredDimension = z.infer<typeof ScoredDimension>;

export const SourceSchema = z.object({
  id: nonEmpty(64),
  title: nonEmpty(400),
  url: z.string().url().max(2000).optional(),
  publisher: z.string().trim().max(300).optional(),
  sourceType: SourceType.default('web'),
  /** ISO-8601. Retrieval timestamp is mandatory for auditability (FR-09). */
  retrievedAt: z.string().max(40).optional(),
  excerpt: z.string().trim().max(2000).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Every material assertion in the report is a claim, tagged as verified
 * evidence, agent inference, or product hypothesis (FR-09). The UI must never
 * present an inference with the same visual weight as sourced evidence.
 */
export const ClaimSchema = z.object({
  id: nonEmpty(64),
  statement: nonEmpty(1200),
  type: ClaimType,
  confidence: Confidence,
  sourceIds: z.array(z.string()).max(12).default([]),
  /** Which report section the claim supports, for grouping in the UI. */
  section: z.string().trim().max(120).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const OpportunitySchema = z.object({
  name: nonEmpty(200),
  description: nonEmpty(8000),
  industry: z.string().trim().max(200).optional(),
  targetCustomer: z.string().trim().max(400).optional(),
  geography: z.string().trim().max(200).optional(),
  businessModel: z.string().trim().max(300).optional(),
  competitors: bullets(20).default([]),
  /**
   * Fields the agent inferred rather than received. With a 75-word intake
   * nearly everything is inferred, and the UI labels it as such.
   */
  inferredFields: z.array(z.string().max(60)).max(20).default([]),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const ExecutiveSummarySchema = z.object({
  problem: nonEmpty(2000),
  targetCustomer: nonEmpty(1000),
  strategicThesis: nonEmpty(2500),
  whyNow: nonEmpty(2000),
  recommendationSummary: nonEmpty(1500),
});

export const CustomerSegmentSchema = z.object({
  id: nonEmpty(64),
  name: nonEmpty(200),
  jobToBeDone: nonEmpty(1200),
  pains: bullets(10).min(1),
  alternatives: bullets(10).default([]),
  economicValue: nonEmpty(1200),
  switchingFriction: nonEmpty(1200),
  confidence: Confidence,
  claimIds: z.array(z.string()).max(12).default([]),
});
export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

const MarketItemSchema = z.object({
  title: nonEmpty(240),
  detail: nonEmpty(1600),
  confidence: Confidence.default('medium'),
  claimIds: z.array(z.string()).max(12).default([]),
});

export const MarketSchema = z.object({
  dynamics: z.array(MarketItemSchema).max(12).default([]),
  trends: z.array(MarketItemSchema).max(12).default([]),
  risks: z.array(MarketItemSchema).max(12).default([]),
  opportunities: z.array(MarketItemSchema).max(12).default([]),
});

export const ValueChainNodeSchema = z.object({
  id: nonEmpty(64),
  /** 1-based position in the ordered chain (FR-05). */
  order: z.number().int().min(1).max(20),
  name: nonEmpty(200),
  participants: bullets(12).default([]),
  customerPain: nonEmpty(1200),
  valueCreated: nonEmpty(1200),
  valueCaptured: nonEmpty(1200),
  technologyDependencies: bullets(12).default([]),
  controlLevel: ControlLevel,
  opportunitySignals: bullets(10).default([]),
});
export type ValueChainNode = z.infer<typeof ValueChainNodeSchema>;

export const CompetitorSchema = z.object({
  id: nonEmpty(64),
  name: nonEmpty(200),
  type: CompetitorType,
  customerServed: nonEmpty(600),
  valueChainPosition: nonEmpty(600),
  advantage: nonEmpty(900),
  strategicSignal: nonEmpty(900),
  claimIds: z.array(z.string()).max(12).default([]),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const InnovationSchema = z.object({
  classification: InnovationClassification,
  rationale: nonEmpty(2500),
  /** How the offering gets its first foothold. */
  entryMechanism: nonEmpty(1500),
});

const DisruptionStageSchema = z.object({
  customer: nonEmpty(900),
  capability: nonEmpty(900),
  economicAdvantage: nonEmpty(900),
  evidence: nonEmpty(900),
  assumptions: bullets(8).default([]),
  risks: bullets(8).default([]),
});

/** Edge -> Improve -> Climb -> Rewrite (FR-07). */
export const DisruptionPathSchema = z.object({
  edge: DisruptionStageSchema,
  improve: DisruptionStageSchema,
  climb: DisruptionStageSchema,
  rewrite: DisruptionStageSchema,
});
export type DisruptionPath = z.infer<typeof DisruptionPathSchema>;

/**
 * Six dimensions, 1-5 each (FR-08). `total` is deliberately absent from the
 * agent contract: the orchestrator computes it so the score can never disagree
 * with its own parts.
 */
export const ScoresInputSchema = z.object({
  marketAttractiveness: ScoredDimension,
  customerPain: ScoredDimension,
  edgeStrength: ScoredDimension,
  valueChainLeverage: ScoredDimension,
  defensibility: ScoredDimension,
  speedToMarket: ScoredDimension,
});
export type ScoresInput = z.infer<typeof ScoresInputSchema>;

export const ScoresSchema = ScoresInputSchema.extend({
  total: z.number().int().min(6).max(30),
});
export type Scores = z.infer<typeof ScoresSchema>;

export const HypothesisSchema = z.object({
  id: nonEmpty(64),
  statement: nonEmpty(1200),
  criticality: Criticality,
  linkedClaimIds: z.array(z.string()).max(12).default([]),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const ExperimentSchema = z.object({
  id: nonEmpty(64),
  hypothesisId: z.string().max(64).optional(),
  experiment: nonEmpty(1200),
  successMetric: nonEmpty(800),
  costEffort: CostEffort,
  durationDays: z.number().int().min(1).max(180),
  nextDecision: nonEmpty(800),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

const PlanPhaseSchema = z.object({
  focus: nonEmpty(600),
  milestones: bullets(8).min(1),
  exitCriteria: nonEmpty(800),
});

/** Days 1-30 Validate, 31-60 Prototype, 61-90 Prove (report section 13). */
export const NinetyDayPlanSchema = z.object({
  validate: PlanPhaseSchema,
  prototype: PlanPhaseSchema,
  prove: PlanPhaseSchema,
});
export type NinetyDayPlan = z.infer<typeof NinetyDayPlanSchema>;

/**
 * `decision` is omitted from the agent contract for the same reason as
 * `scores.total`: it is derived from the score by a documented heuristic, not
 * chosen by the model.
 */
export const RecommendationInputSchema = z.object({
  headline: nonEmpty(400),
  topOpportunity: nonEmpty(1200),
  greatestRisk: nonEmpty(1200),
  criticalAssumption: nonEmpty(1200),
  nextExperiment: nonEmpty(1200),
  /** ISO date (YYYY-MM-DD) by which the next go/no-go should be made. */
  nextDecisionDate: z.string().max(40).optional(),
  rationale: nonEmpty(2500),
});

export const RecommendationSchema = RecommendationInputSchema.extend({
  decision: Decision,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** ------------------------------------------------------------------
 *  Layer 1: the agent contract.
 *  ------------------------------------------------------------------ */
export const AgentPayloadSchema = z.object({
  opportunity: OpportunitySchema,
  executiveSummary: ExecutiveSummarySchema,
  customerSegments: z.array(CustomerSegmentSchema).min(1).max(8),
  market: MarketSchema,
  valueChain: z.array(ValueChainNodeSchema).min(2).max(12),
  competitors: z.array(CompetitorSchema).max(12).default([]),
  innovation: InnovationSchema,
  disruptionPath: DisruptionPathSchema,
  scores: ScoresInputSchema,
  claims: z.array(ClaimSchema).max(120).default([]),
  hypotheses: z.array(HypothesisSchema).max(20).default([]),
  experiments: z.array(ExperimentSchema).max(20).default([]),
  ninetyDayPlan: NinetyDayPlanSchema,
  sources: z.array(SourceSchema).max(80).default([]),
  recommendation: RecommendationInputSchema,
});
export type AgentPayload = z.infer<typeof AgentPayloadSchema>;

/** ------------------------------------------------------------------
 *  Layer 2: the persisted canonical object.
 *  ------------------------------------------------------------------ */
export const ProvenanceSchema = z.object({
  provider: z.string().max(80),
  workflowVersion: z.string().max(120),
  promptVersion: z.string().max(80),
  modelVersion: z.string().max(120),
  startedAt: z.string().max(40),
  completedAt: z.string().max(40),
  durationMs: z.number().int().min(0),
  retryCount: z.number().int().min(0).default(0),
  toolCallCount: z.number().int().min(0).default(0),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  estimatedCostUsd: z.number().min(0).optional(),
  /** True when the payload needed repair before it validated. */
  repaired: z.boolean().default(false),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ScaleEvaluationSchema = z.object({
  evaluationId: nonEmpty(64),
  opportunityId: nonEmpty(64),
  organizationId: nonEmpty(64),
  runId: nonEmpty(64),
  /** Monotonic per opportunity. Reruns add versions, never overwrite (FR-11). */
  version: z.number().int().min(1),
  createdAt: z.string().max(40),

  schemaVersion: z.string().max(20),
  templateId: z.string().max(80),
  templateVersion: z.string().max(20),
  workflowVersion: z.string().max(120),

  opportunity: OpportunitySchema,
  executiveSummary: ExecutiveSummarySchema,
  customerSegments: z.array(CustomerSegmentSchema),
  market: MarketSchema,
  valueChain: z.array(ValueChainNodeSchema),
  competitors: z.array(CompetitorSchema),
  innovation: InnovationSchema,
  disruptionPath: DisruptionPathSchema,
  scores: ScoresSchema,
  claims: z.array(ClaimSchema),
  hypotheses: z.array(HypothesisSchema),
  experiments: z.array(ExperimentSchema),
  ninetyDayPlan: NinetyDayPlanSchema,
  sources: z.array(SourceSchema),
  recommendation: RecommendationSchema,
  provenance: ProvenanceSchema,
});
export type ScaleEvaluation = z.infer<typeof ScaleEvaluationSchema>;
