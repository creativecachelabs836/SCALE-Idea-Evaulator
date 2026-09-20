import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { PROGRESS_STAGES, TERMINAL_STATUSES } from '@/domain/enums';
import * as repo from '@/data/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/runs/{id}
 *
 * The progress endpoint the client polls while an evaluation is in flight
 * (AC-02). Long-running work is never held open on a synchronous request.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const run = repo.getRun(session.organizationId, id);
  if (!run) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  const done = TERMINAL_STATUSES.has(run.status);
  const evaluation =
    run.status === 'completed'
      ? repo.getLatestEvaluationSummary(session.organizationId, run.opportunityId)
      : null;

  return NextResponse.json(
    {
      runId: run.id,
      opportunityId: run.opportunityId,
      status: run.status,
      stageIndex: run.stageIndex,
      stageLabel: run.stageLabel,
      progress: run.progress,
      stages: PROGRESS_STAGES.map((s) => s.label),
      retryCount: run.retryCount,
      error: run.errorMessage,
      errorDetails: run.errorDetails,
      done,
      evaluationId: evaluation?.id ?? null,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
