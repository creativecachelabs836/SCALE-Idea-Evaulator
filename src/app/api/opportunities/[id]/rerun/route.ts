import { NextResponse } from 'next/server';
import { requireSession, canWrite } from '@/lib/session';
import * as repo from '@/data/repositories';
import { startRun } from '@/orchestration/runner';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/opportunities/{id}/rerun
 *
 * Starts a fresh evaluation of an existing opportunity. Prior versions are
 * never overwritten (FR-11, AC-08).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Your role cannot start evaluations.' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const opportunity = repo.getOpportunity(session.organizationId, id);
  if (!opportunity) {
    return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 });
  }

  // One evaluation at a time per opportunity, so a double-click cannot burn a
  // second upstream call.
  const active = repo.getActiveRun(session.organizationId, id);
  if (active) {
    return NextResponse.json(
      { runId: active.id, status: active.status, alreadyRunning: true },
      { status: 200 },
    );
  }

  if (!repo.consumeRateLimit(`rerun:${session.organizationId}`, config.rateLimitPerHour)) {
    return NextResponse.json(
      { error: `Rate limit reached: ${config.rateLimitPerHour} evaluations per hour.` },
      { status: 429 },
    );
  }

  const run = startRun({
    organizationId: session.organizationId,
    userId: session.userId,
    opportunityId: opportunity.id,
    description: opportunity.description,
    intake: opportunity.intake,
  });

  return NextResponse.json({ runId: run.id, status: run.status }, { status: 202 });
}
