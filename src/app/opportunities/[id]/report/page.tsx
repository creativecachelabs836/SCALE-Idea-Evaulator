import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import * as repo from '@/data/repositories';
import { ExecutiveReport } from '@/report/ExecutiveReport';
import { TI_SCALE_EXECUTIVE_V1 } from '@/report/template-config';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Browser preview of ti_scale_executive_v1 (FR-12, AC-09).
 *
 * The same route, with `?print=1`, is what headless Chromium loads to produce
 * the PDF - so preview and export cannot diverge.
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; print?: string }>;
}) {
  const session = await getSession();
  if (!session) notFound();
  const { id } = await params;
  const { v, print } = await searchParams;

  const versions = repo.listEvaluationSummaries(session.organizationId, id);
  const selected = v ? versions.find((s) => String(s.version) === v) : versions[0];
  if (!selected) notFound();

  const evaluation = repo.getEvaluation(session.organizationId, selected.id);
  if (!evaluation) notFound();

  const isPrint = print === '1';

  return (
    <>
      {!isPrint ? (
        <div className="report-toolbar no-print">
          <Link href={`/opportunities/${id}`} style={{ fontWeight: 600 }}>
            &larr; Back to analysis
          </Link>
          <span className="small" style={{ opacity: 0.8 }}>
            {TI_SCALE_EXECUTIVE_V1.id} v{TI_SCALE_EXECUTIVE_V1.version} - evaluation v
            {evaluation.version}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PrintButton />
            <a
              className="button"
              href={`/api/evaluations/${selected.id}/pdf`}
              download={`${evaluation.opportunity.name.replace(/[^\w-]+/g, '-')}-scale-report.pdf`}
            >
              Download PDF
            </a>
          </div>
        </div>
      ) : null}

      <ExecutiveReport evaluation={evaluation} config={TI_SCALE_EXECUTIVE_V1} />
    </>
  );
}
