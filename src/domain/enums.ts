import { z } from 'zod';

/**
 * Core enumerations from spec section 6. These are the only legal values in a
 * canonical ScaleEvaluation; the orchestration layer rejects anything else
 * before persistence.
 */

export const ClaimType = z.enum(['evidence', 'inference', 'hypothesis']);
export type ClaimType = z.infer<typeof ClaimType>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const InnovationClassification = z.enum(['sustaining', 'potentially_disruptive']);
export type InnovationClassification = z.infer<typeof InnovationClassification>;

export const Decision = z.enum(['INVEST', 'REFINE', 'RECONSIDER']);
export type Decision = z.infer<typeof Decision>;

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

/**
 * Agent progress states (spec section 8) mapped onto the persisted run.status
 * enum. The UI shows the human label; the database stores the canonical status.
 */
export const PROGRESS_STAGES: ReadonlyArray<{
  label: string;
  status: RunStatus;
  /** Fraction of the run considered complete when this stage begins. */
  progress: number;
}> = [
  { label: 'Understanding idea', status: 'queued', progress: 0.02 },
  { label: 'Researching industry', status: 'researching', progress: 0.12 },
  { label: 'Analyzing companies', status: 'researching', progress: 0.24 },
  { label: 'Mapping customers', status: 'synthesizing', progress: 0.38 },
  { label: 'Building value chain', status: 'mapping', progress: 0.52 },
  { label: 'Testing disruption thesis', status: 'mapping', progress: 0.66 },
  { label: 'Evaluating opportunity', status: 'evaluating', progress: 0.78 },
  { label: 'Preparing recommendation', status: 'evaluating', progress: 0.9 },
  { label: 'Rendering report', status: 'rendering', progress: 0.97 },
];

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'completed',
  'failed',
]);
