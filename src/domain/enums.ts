import { z } from 'zod';

/**
 * Core enumerations (SPEC §3).
 *
 * These are the only legal values in a canonical evaluation. Validation
 * rejects anything else rather than coercing it, because a value outside this
 * set means the producer misunderstood the contract, and silently mapping it to
 * a neighbour would hide that.
 */

export const ClaimType = z.enum(['evidence', 'inference', 'hypothesis']);
export type ClaimType = z.infer<typeof ClaimType>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const InnovationClassification = z.enum(['sustaining', 'potentially_disruptive']);
export type InnovationClassification = z.infer<typeof InnovationClassification>;

export const Decision = z.enum(['INVEST', 'REFINE', 'RECONSIDER']);
export type Decision = z.infer<typeof Decision>;

/**
 * Run status. Nothing in Iteration 1 produces a run — durable runs arrive in
 * Iteration 5 — but the vocabulary belongs to the domain, and defining it here
 * keeps the progress stages from being invented ad hoc later.
 */
export const RunStatus = z.enum([
  'queued',
  'researching',
  'synthesizing',
  'mapping',
  'evaluating',
  'rendering',
  'completed',
  'failed',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const ControlLevel = z.enum(['high', 'medium', 'low']);
export type ControlLevel = z.infer<typeof ControlLevel>;

export const CompetitorType = z.enum([
  'market_leader',
  'challenger',
  'incumbent',
  'adjacent',
  'substitute',
]);
export type CompetitorType = z.infer<typeof CompetitorType>;

export const Criticality = z.enum(['high', 'medium', 'low']);
export type Criticality = z.infer<typeof Criticality>;

export const CostEffort = z.enum(['low', 'medium', 'high']);
export type CostEffort = z.infer<typeof CostEffort>;

export const SourceType = z.enum([
  'web',
  'news',
  'research',
  'regulatory',
  'company',
  'financial',
  'user_upload',
  'other',
]);
export type SourceType = z.infer<typeof SourceType>;

/** The four stages of the disruption path (SPEC §3, step 6). */
export const DISRUPTION_STAGES = [
  { key: 'edge', label: 'Enters at the Edge' },
  { key: 'improve', label: 'Improves Quietly' },
  { key: 'climb', label: 'Climbs the Value Chain' },
  { key: 'rewrite', label: 'Rewrites the Value Chain' },
] as const;

export type DisruptionStageKey = (typeof DISRUPTION_STAGES)[number]['key'];
