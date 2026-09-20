import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { config } from '@/lib/config';
import { checkDescription } from '@/lib/words';
import { requireSession, canWrite } from '@/lib/session';
import * as repo from '@/data/repositories';
import { startRun } from '@/orchestration/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/opportunities
 *
 * The only endpoint the core user journey requires. Creates the opportunity and
 * starts a durable asynchronous evaluation (FR-01, FR-02, AC-01, AC-02).
 *
 * Only `description` is required. Every other field is optional and, when
 * absent, inferred by the agent.
 */

const Body = z.object({
  description: z.string().min(1).max(20_000),
  name: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(200).optional(),
  targetCustomer: z.string().trim().max(400).optional(),
  geography: z.string().trim().max(200).optional(),
  businessModel: z.string().trim().max(300).optional(),
  competitors: z.array(z.string().trim().max(200)).max(20).optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
});

/** Derive a working title before the agent has had a chance to name it. */
function provisionalName(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  const words = firstSentence.trim().split(/\s+/).slice(0, 8).join(' ');
  return (words.length > 70 ? `${words.slice(0, 67)}...` : words) || 'Untitled opportunity';
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Your role cannot create evaluations.' }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request.', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { description, idempotencyKey, ...intake } = parsed.data;

  // The 75-word gate. Enforced server-side; the client counter is a courtesy.
  const check = checkDescription(description, config.minDescriptionWords, config.maxDescriptionWords);
  if (!check.ok) {
    return NextResponse.json({ error: check.message, words: check.words }, { status: 422 });
  }

  if (!repo.consumeRateLimit(`submit:${clientKey(request)}`, config.rateLimitPerHour)) {
    return NextResponse.json(
      { error: `Rate limit reached: ${config.rateLimitPerHour} evaluations per hour.` },
      { status: 429 },
    );
  }

  const opportunity = repo.createOpportunity({
    organizationId: session.organizationId,
    createdBy: session.userId,
    name: intake.name?.trim() || provisionalName(description),
    description: description.trim(),
    intake,
  });

  const run = startRun({
    organizationId: session.organizationId,
    userId: session.userId,
    opportunityId: opportunity.id,
    description: opportunity.description,
    intake: opportunity.intake,
    idempotencyKey,
  });

  return NextResponse.json(
    { opportunityId: opportunity.id, runId: run.id, status: run.status },
    { status: 202 },
  );
}

/** GET /api/opportunities - the workspace list (FR-11). */
export async function GET() {
  const session = await requireSession();
  const rows = repo.listOpportunities(session.organizationId);

  return NextResponse.json({
    opportunities: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      latest: row.latest,
      activeRunId: row.activeRun?.id ?? null,
      activeStatus: row.activeRun?.status ?? null,
    })),
  });
}
