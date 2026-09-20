import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/session';
import * as repo from '@/data/repositories';
import { renderReportPdf, PdfUnavailableError } from '@/report/pdf';
import { TI_SCALE_EXECUTIVE_V1 } from '@/report/template-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// PDF generation targets <15s; allow headroom before the platform kills it.
export const maxDuration = 60;

/**
 * GET /api/evaluations/{id}/pdf
 *
 * Renders the stored evaluation through ti_scale_executive_v1 and returns an
 * 8.5x11 PDF (FR-12, AC-09).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await ctx.params;

  const evaluation = repo.getEvaluation(session.organizationId, id);
  if (!evaluation) {
    return NextResponse.json({ error: 'Evaluation not found.' }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const url = `${origin}/opportunities/${evaluation.opportunityId}/report?v=${evaluation.version}&print=1`;

  try {
    const pdf = await renderReportPdf({
      url,
      cookieHeader: request.headers.get('cookie') ?? undefined,
      footerText: TI_SCALE_EXECUTIVE_V1.footerText,
    });

    repo.writeAudit({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'report.exported',
      subjectType: 'evaluation',
      subjectId: id,
      detail: `${TI_SCALE_EXECUTIVE_V1.id} v${TI_SCALE_EXECUTIVE_V1.version}`,
    });

    const filename = `${evaluation.opportunity.name.replace(/[^\w-]+/g, '-').slice(0, 60)}-scale-report.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof PdfUnavailableError) {
      // A missing renderer is an operator problem, not a user error: the
      // browser preview and print path still work.
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF generation failed.' },
      { status: 500 },
    );
  }
}
