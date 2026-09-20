import 'server-only';
import { randomUUID } from 'node:crypto';
import { getProvider, PermanentProviderError, TransientProviderError } from '@/agent';
import { PROMPT_VERSION } from '@/agent/prompt';
import { PROGRESS_STAGES } from '@/domain/enums';
import {
  SCHEMA_VERSION,
  TEMPLATE_ID,
  TEMPLATE_VERSION,
  ScaleEvaluationSchema,
  type ScaleEvaluation,
} from '@/domain/scale-evaluation';
import { decisionForTotal, withTotal } from '@/domain/scoring';
import { config } from '@/lib/config';
import { formatIssues } from '@/agent/validate';
import * as repo from '@/data/repositories';

/**
 * Evaluation orchestration (spec section 7, Agent Orchestration).
 *
 * Runs are asynchronous and durable: the HTTP request that starts one returns
 * immediately with a run id, and all state lives in the database rather than in
 * process memory. A worker restart mid-run surfaces as a failed run with a
 * clear message, never as an opportunity stuck on "researching".
 *
 * V1 executes work in-process on a bounded concurrency pool. The queue is a
 * seam, not a permanent choice - `enqueue` is the single function a hosted
 * queue would replace.
 */

const MAX_CONCURRENT = Number(process.env.SCALE_MAX_CONCURRENT ?? 3);
const STALE_RUN_MS = Number(process.env.SCALE_STALE_RUN_MS ?? 15 * 60_000);

let active = 0;
const pending: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => pending.push(resolve));
}

function release(): void {
  const next = pending.shift();
  if (next) {
    next();
    return;
  }
  active = Math.max(0, active - 1);
}

export interface StartRunParams {
  organizationId: string;
  userId: string;
  opportunityId: string;
  description: string;
  intake: repo.IntakeFields;
  idempotencyKey?: string;
}

/**
 * Create a run row and schedule it. Returns as soon as the run is durable; the
 * client polls `/api/runs/{id}` from there.
 */
export function startRun(params: StartRunParams): repo.RunRow {
  // Reap anything abandoned by a previous process before adding work.
  repo.reapStaleRuns(STALE_RUN_MS);

  if (params.idempotencyKey) {
    const existing = repo.getRunByIdempotencyKey(params.organizationId, params.idempotencyKey);
    if (existing) return existing;
  }

  const provider = getProvider();
  const run = repo.createRun({
    opportunityId: params.opportunityId,
    organizationId: params.organizationId,
    createdBy: params.userId,
    provider: provider.name,
    workflowVersion: config.provider === 'openai-agent' ? config.workflowId : `${provider.name}:${PROMPT_VERSION}`,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    templateId: TEMPLATE_ID,
    templateVersion: TEMPLATE_VERSION,
    idempotencyKey: params.idempotencyKey,
  });

  repo.writeAudit({
    organizationId: params.organizationId,
    actorId: params.userId,
    action: 'run.started',
    subjectType: 'run',
    subjectId: run.id,
    detail: `provider=${provider.name}`,
  });

  enqueue(run.id, params);
  return run;
}

function enqueue(runId: string, params: StartRunParams): void {
  void acquire().then(() =>
    execute(runId, params)
      .catch((error) => {
        // Last-resort guard: a run must never be left without a terminal state.
        const message = error instanceof Error ? error.message : String(error);
        try {
          repo.markRunFailed(runId, `Unexpected orchestration failure: ${message}`);
        } catch {
          /* the database is already unreachable; nothing further to do */
        }
      })
      .finally(release),
  );
}

function reportStage(runId: string, stageIndex: number): void {
  const stage = PROGRESS_STAGES[Math.min(stageIndex, PROGRESS_STAGES.length - 1)];
  repo.updateRunProgress(runId, {
    status: stage.status,
    stageIndex,
    stageLabel: stage.label,
    progress: stage.progress,
  });
}

async function execute(runId: string, params: StartRunParams): Promise<void> {
  const provider = getProvider();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= config.maxRetries) {
    try {
      reportStage(runId, 0);

      const response = await provider.evaluate(
        {
          runId,
          description: params.description,
          name: params.intake.name,
          industry: params.intake.industry,
          targetCustomer: params.intake.targetCustomer,
          geography: params.intake.geography,
          businessModel: params.intake.businessModel,
          competitors: params.intake.competitors,
          attachments: params.intake.attachments,
        },
        (stageIndex) => reportStage(runId, stageIndex),
      );

      reportStage(runId, PROGRESS_STAGES.length - 1); // "Rendering report"

      // Scores and the decision are computed here, never taken from the model.
      const scores = withTotal(response.payload.scores);
      const decision = decisionForTotal(scores.total);
      const completedAt = new Date().toISOString();

      const candidate: ScaleEvaluation = {
        evaluationId: randomUUID(),
        opportunityId: params.opportunityId,
        organizationId: params.organizationId,
        runId,
        version: repo.nextEvaluationVersion(params.opportunityId),
        createdAt: completedAt,

        schemaVersion: SCHEMA_VERSION,
        templateId: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
        workflowVersion: response.workflowVersion,

        ...response.payload,
        scores,
        recommendation: { ...response.payload.recommendation, decision },
        provenance: {
          provider: provider.name,
          workflowVersion: response.workflowVersion,
          promptVersion: PROMPT_VERSION,
          modelVersion: response.modelVersion,
          startedAt,
          completedAt,
          durationMs: Date.now() - startMs,
          retryCount: attempt,
          toolCallCount: response.usage.toolCallCount ?? 0,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          estimatedCostUsd: response.usage.estimatedCostUsd,
          repaired: response.repaired,
        },
      };

      // Final gate: the envelope is validated too, so nothing reaches the
      // database that the renderer cannot safely consume.
      const parsed = ScaleEvaluationSchema.safeParse(candidate);
      if (!parsed.success) {
        throw new PermanentProviderError(
          'Assembled evaluation failed canonical schema validation.',
          formatIssues(parsed.error),
        );
      }

      repo.recordRunTelemetry(runId, {
        modelVersion: response.modelVersion,
        workflowVersion: response.workflowVersion,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        toolCallCount: response.usage.toolCallCount,
        estimatedCostUsd: response.usage.estimatedCostUsd,
        sourceCount: parsed.data.sources.length,
        schemaValid: true,
        repairNotes: response.repairNotes,
        retryCount: attempt,
      });

      repo.saveEvaluation(parsed.data);
      return;
    } catch (error) {
      lastError = error;

      const retryable = error instanceof TransientProviderError;
      if (!retryable || attempt >= config.maxRetries) break;

      attempt += 1;
      repo.updateRunProgress(runId, { status: 'queued', stageIndex: 0, progress: 0.02 });
      // Exponential backoff with jitter, so a burst of failures does not
      // resynchronize into a second burst.
      const backoff = 2 ** attempt * 1000 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  const details =
    lastError instanceof PermanentProviderError ? lastError.details : [];
  const message =
    lastError instanceof Error ? lastError.message : 'Evaluation failed for an unknown reason.';

  repo.recordRunTelemetry(runId, { schemaValid: false, retryCount: attempt });
  repo.markRunFailed(runId, message, details, attempt);
  repo.writeAudit({
    organizationId: params.organizationId,
    actorId: params.userId,
    action: 'run.failed',
    subjectType: 'run',
    subjectId: runId,
    detail: message.slice(0, 500),
  });
}
