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
import { MAX_SCORE, MAX_TOTAL, MIN_SCORE, MIN_TOTAL } from './scoring';

/**
 * The canonical S.C.A.L.E. data model (SPEC §3, principle P1).
 *
 * Two layers:
 *
 *   1. `EvaluationPayloadSchema` — what a producer of analysis is required to
 *      return. This is the validation boundary. Free-form prose never reaches
 *      a consumer.
 *   2. `ScaleEvaluationSchema` — the assembled object: the payload plus
 *      identity, versioning, and the two fields we compute ourselves.
 *
 * `scores.total` and `recommendation.decision` are deliberately absent from
 * layer 1. They are derived in `assemble.ts` so that they cannot disagree with
 * the dimensions they come from (P2).
 *
 * Iteration 1 keeps the envelope minimal. Persistence identifiers — opportunity,
 * organization, run, version — arrive with Iteration 5, and `schemaVersion`
 * exists so that addition is a visible, versioned change rather than a silent
 * one.
 */

export const SCHEMA_VERSION = '1.0.0';

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const bullets = (max: number) => z.array(nonEmpty(600)).max(max);

/** A 1-5 score that must carry its own reasoning. */
export const ScoredDimensionSchema = z.object({
  score: z.number().int().min(MIN_SCORE).max(MAX_SCORE),
  rationale: nonEmpty(1500),
  /** Claim ids backing this score, so a consumer can show evidence beside it. */
  claimIds: z.array(z.string()).max(12).default([]),
});
export type ScoredDimension = z.infer<typeof ScoredDimensionSchema>;

export const SourceSchema = z.object({
  id: nonEmpty(64),
  title: nonEmpty(400),
  url: z.string().url().max(2000).optional(),
  publisher: z.string().trim().max(300).optional(),
  sourceType: SourceType.default('web'),
  /** ISO-8601. Retrieval time is what makes a citation auditable later. */
  retrievedAt: z.string().max(40).optional(),
  excerpt: z.string().trim().max(2000).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Every material assertion is a claim, typed as verified evidence, reasoned
 * inference, or untested hypothesis (P4). Consumers must never present an
 * inference with the same weight as a sourced fact.
 */
export const ClaimSchema = z.object({
  id: nonEmpty(64),
  statement: nonEmpty(1200),
  type: ClaimType,
  confidence: Confidence,
  sourceIds: z.array(z.string()).max(12).default([]),
  /** Which part of the analysis the claim supports, for grouping. */
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
   * Fields inferred rather than supplied. With a 75-word intake nearly
   * everything is inferred, and the product promise requires saying so.
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
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

/** Segment by the job to be done, not by firmographics alone (SPEC §3, step 3). */
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

export const MarketItemSchema = z.object({
  title: nonEmpty(240),
  detail: nonEmpty(1600),
  confidence: Confidence.default('medium'),
  claimIds: z.array(z.string()).max(12).default([]),
});
export type MarketItem = z.infer<typeof MarketItemSchema>;

export const MarketSchema = z.object({
  dynamics: z.array(MarketItemSchema).max(12).default([]),
  trends: z.array(MarketItemSchema).max(12).default([]),
  risks: z.array(MarketItemSchema).max(12).default([]),
  opportunities: z.array(MarketItemSchema).max(12).default([]),
});
export type Market = z.infer<typeof MarketSchema>;

/** Ordered chain from raw input to end customer (SPEC §3, step 4). */
export const ValueChainNodeSchema = z.object({
  id: nonEmpty(64),
  /** 1-based position. Normalized across the set, never trusted per node (P3). */
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

/**
 * Sustaining or potentially disruptive, and defended either way. A
 * technology-led idea is not automatically disruptive (SPEC §3, step 5).
 */
export const InnovationSchema = z.object({
  classification: InnovationClassification,
  rationale: nonEmpty(2500),
  entryMechanism: nonEmpty(1500),
});
export type Innovation = z.infer<typeof InnovationSchema>;

export const DisruptionStageSchema = z.object({
  customer: nonEmpty(900),
  capability: nonEmpty(900),
  economicAdvantage: nonEmpty(900),
  evidence: nonEmpty(900),
  assumptions: bullets(8).default([]),
  risks: bullets(8).default([]),
});
export type DisruptionStage = z.infer<typeof DisruptionStageSchema>;

/** Edge -> Improve -> Climb -> Rewrite. All four are required. */
export const DisruptionPathSchema = z.object({
  edge: DisruptionStageSchema,
  improve: DisruptionStageSchema,
  climb: DisruptionStageSchema,
  rewrite: DisruptionStageSchema,
});
export type DisruptionPath = z.infer<typeof DisruptionPathSchema>;

/** The six dimensions, without a total. The total is computed (P2). */
export const DimensionScoresSchema = z.object({
  marketAttractiveness: ScoredDimensionSchema,
  customerPain: ScoredDimensionSchema,
  edgeStrength: ScoredDimensionSchema,
  valueChainLeverage: ScoredDimensionSchema,
  defensibility: ScoredDimensionSchema,
  speedToMarket: ScoredDimensionSchema,
});
export type DimensionScoresInput = z.infer<typeof DimensionScoresSchema>;

export const ScoresSchema = DimensionScoresSchema.extend({
  total: z.number().int().min(MIN_TOTAL).max(MAX_TOTAL),
});
export type Scores = z.infer<typeof ScoresSchema>;

export const HypothesisSchema = z.object({
  id: nonEmpty(64),
  statement: nonEmpty(1200),
  criticality: Criticality,
  linkedClaimIds: z.array(z.string()).max(12).default([]),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

/** Runnable in under 90 days, with the decision the result unlocks. */
export const ExperimentSchema = z.object({
  id: nonEmpty(64),
  hypothesisId: z.string().max(64).optional(),
  experiment: nonEmpty(1200),
  successMetric: nonEmpty(800),
  costEffort: CostEffort,
  durationDays: z.number().int().min(1).max(90),
  nextDecision: nonEmpty(800),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const PlanPhaseSchema = z.object({
  focus: nonEmpty(600),
  milestones: bullets(8).min(1),
  exitCriteria: nonEmpty(800),
});
export type PlanPhase = z.infer<typeof PlanPhaseSchema>;

/** Days 1-30 Validate, 31-60 Prototype, 61-90 Prove. */
export const NinetyDayPlanSchema = z.object({
  validate: PlanPhaseSchema,
  prototype: PlanPhaseSchema,
  prove: PlanPhaseSchema,
});
export type NinetyDayPlan = z.infer<typeof NinetyDayPlanSchema>;

/** The recommendation without its decision. The decision is derived (P2). */
export const RecommendationNarrativeSchema = z.object({
  headline: nonEmpty(400),
  topOpportunity: nonEmpty(1200),
  greatestRisk: nonEmpty(1200),
  criticalAssumption: nonEmpty(1200),
  nextExperiment: nonEmpty(1200),
  /** ISO date (YYYY-MM-DD) by which the next go/no-go should be made. */
  nextDecisionDate: z.string().max(40).optional(),
  rationale: nonEmpty(2500),
});
export type RecommendationNarrative = z.infer<typeof RecommendationNarrativeSchema>;

export const RecommendationSchema = RecommendationNarrativeSchema.extend({
  decision: Decision,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/* ------------------------------------------------------------------ *
 * Layer 1 — the producer contract
 * ------------------------------------------------------------------ */

export const EvaluationPayloadSchema = z.object({
  opportunity: OpportunitySchema,
  executiveSummary: ExecutiveSummarySchema,
  customerSegments: z.array(CustomerSegmentSchema).min(1).max(8),
  market: MarketSchema,
  valueChain: z.array(ValueChainNodeSchema).min(2).max(12),
  competitors: z.array(CompetitorSchema).max(12).default([]),
  innovation: InnovationSchema,
  disruptionPath: DisruptionPathSchema,
  scores: DimensionScoresSchema,
  claims: z.array(ClaimSchema).max(120).default([]),
  hypotheses: z.array(HypothesisSchema).max(20).default([]),
  experiments: z.array(ExperimentSchema).max(20).default([]),
  ninetyDayPlan: NinetyDayPlanSchema,
  sources: z.array(SourceSchema).max(80).default([]),
  recommendation: RecommendationNarrativeSchema,
});
export type EvaluationPayload = z.infer<typeof EvaluationPayloadSchema>;

/** The sections a payload must contain. Used by tests and error reporting. */
export const REQUIRED_PAYLOAD_SECTIONS = [
  'opportunity',
  'executiveSummary',
  'customerSegments',
  'market',
  'valueChain',
  'innovation',
  'disruptionPath',
  'scores',
  'ninetyDayPlan',
  'recommendation',
] as const satisfies ReadonlyArray<keyof EvaluationPayload>;

/* ------------------------------------------------------------------ *
 * Layer 2 — the assembled evaluation
 * ------------------------------------------------------------------ */

export const ScaleEvaluationSchema = EvaluationPayloadSchema.extend({
  evaluationId: nonEmpty(64),
  createdAt: z.string().max(40),
  schemaVersion: z.string().max(20),
  scores: ScoresSchema,
  recommendation: RecommendationSchema,
});
export type ScaleEvaluation = z.infer<typeof ScaleEvaluationSchema>;
