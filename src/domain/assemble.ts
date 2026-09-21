import { randomUUID } from 'node:crypto';
import {
  SCHEMA_VERSION,
  ScaleEvaluationSchema,
  type EvaluationPayload,
  type ScaleEvaluation,
} from './scale-evaluation';
import { computeTotal, decisionForTotal } from './scoring';
import { SchemaValidationError, formatIssues } from './validation';

/**
 * Assembly: payload in, canonical evaluation out.
 *
 * This is the only place in the codebase where `scores.total` and
 * `recommendation.decision` come into existence. Both are derived from the six
 * dimensions, never accepted from a producer, which is what makes principle P2
 * enforceable rather than merely stated.
 *
 * The assembled object is validated on the way out as well as the way in, so a
 * bug in this function fails here rather than somewhere downstream that trusted
 * the result.
 */

export interface AssembleOptions {
  /** Stable identifier. Generated when omitted. */
  evaluationId?: string;
  /** ISO-8601 creation time. Defaults to now. Injectable for deterministic tests. */
  createdAt?: string;
}

export function assembleEvaluation(
  payload: EvaluationPayload,
  options: AssembleOptions = {},
): ScaleEvaluation {
  const total = computeTotal(payload.scores);
  const decision = decisionForTotal(total);

  const candidate: ScaleEvaluation = {
    ...payload,
    evaluationId: options.evaluationId ?? randomUUID(),
    createdAt: options.createdAt ?? new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    scores: { ...payload.scores, total },
    recommendation: { ...payload.recommendation, decision },
  };

  const parsed = ScaleEvaluationSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SchemaValidationError(
      'Assembled evaluation failed canonical schema validation.',
      formatIssues(parsed.error),
    );
  }

  return parsed.data;
}
