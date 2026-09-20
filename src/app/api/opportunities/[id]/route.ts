import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import * as repo from '@/data/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/opportunities/{id}
 *
 * Returns the opportunity, every saved evaluation version, and every run.
 * Reruns append versions, so history is always inspectable (FR-11, AC-08).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const opportunity = repo.getOpportunity(session.organizationId, id);
  if (!opportunity) {
    return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 });
  }

  return NextResponse.json({
    opportunity: {
      id: opportunity.id,
      name: opportunity.name,
      description: opportunity.description,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
    },
    versions: repo.listEvaluationSummaries(session.organizationId, id),
    runs: repo.listRuns(session.organizationId, id).map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      provider: run.provider,
      workflowVersion: run.workflowVersion,
      promptVersion: run.promptVersion,
      schemaVersion: run.schemaVersion,
      modelVersion: run.modelVersion,
      templateId: run.templateId,
      templateVersion: run.templateVersion,
      retryCount: run.retryCount,
      sourceCount: run.sourceCount,
      schemaValid: run.schemaValid,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      toolCallCount: run.toolCallCount,
      estimatedCostUsd: run.estimatedCostUsd,
      error: run.errorMessage,
    })),
  });
}
