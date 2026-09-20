import type { AgentPayload } from '@/domain/scale-evaluation';

/**
 * The server-side abstraction that keeps the rest of the platform from being
 * coupled to a single model or workflow implementation (spec section 7,
 * service-boundary guidance). Swapping providers must not touch the UI, the
 * report template, or the data model.
 */

export interface EvaluationRequest {
  runId: string;
  description: string;
  name?: string;
  industry?: string;
  targetCustomer?: string;
  geography?: string;
  businessModel?: string;
  competitors?: string[];
  attachments?: Array<{ filename: string; excerpt: string }>;
  /** Cooperative cancellation / timeout. */
  signal?: AbortSignal;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  toolCallCount?: number;
}

export interface EvaluationResponse {
  payload: AgentPayload;
  usage: ProviderUsage;
  /** Identifier of the model that actually served the run. */
  modelVersion: string;
  /** Workflow or pipeline identifier + revision. */
  workflowVersion: string;
  repaired: boolean;
  repairNotes: string[];
}

/** Emitted as the provider advances, so the client sees meaningful progress. */
export type ProgressReporter = (stageIndex: number, detail?: string) => void;

export interface EvaluationProvider {
  readonly name: string;
  evaluate(request: EvaluationRequest, onProgress: ProgressReporter): Promise<EvaluationResponse>;
}

/** Retryable upstream failure (timeout, 429, 5xx). */
export class TransientProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TransientProviderError';
  }
}

/** Non-retryable failure (bad credentials, unrepairable schema violation). */
export class PermanentProviderError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'PermanentProviderError';
  }
}
