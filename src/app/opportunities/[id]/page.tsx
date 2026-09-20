import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import * as repo from '@/data/repositories';
import { RunProgress } from '@/components/RunProgress';
import { RerunButton } from '@/components/RerunButton';
import { SectionHeading, DecisionBadge, formatDate } from '@/components/primitives';
import { MAX_TOTAL } from '@/domain/scoring';
import {
  CompetitiveLandscape,
  CustomerSegments,
  DisruptionPath,
  EvidenceLayer,
  ExecutiveOverview,
  Experiments,
  FinalRecommendation,
  InnovationClassification,
  MarketContext,
  NinetyDayPlan,
  Scorecard,
  SourceList,
  ValueChain,
} from '@/components/analysis';

export const dynamic = 'force-dynamic';

/**
 * The interactive analysis view (AC-04, AC-05, AC-06, AC-07).
 *
 * Renders the same component library the executive report uses. While a run is
 * in flight it shows progress instead; the client refreshes the route once the
 * run reaches a terminal state.
 */
export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await getSession();
  if (!session) notFound();
  const { id } = await params;
  const { v } = await searchParams;

  const opportunity = repo.getOpportunity(session.organizationId, id);
  if (!opportunity) notFound();

  const versions = repo.listEvaluationSummaries(session.organizationId, id);
  const activeRun = repo.getActiveRun(session.organizationId, id);

  // ?v=N pins a historical version; without it the latest is shown.
  const selected = v ? versions.find((s) => String(s.version) === v) : versions[0];
  const evaluation = selected
    ? repo.getEvaluation(session.organizationId, selected.id)
    : null;

  const failedRun = !activeRun && !evaluation
    ? repo.listRuns(session.organizationId, id).find((r) => r.status === 'failed')
    : null;

  return (
    <div className="shell">
      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 380px' }}>
            <div className="eyebrow">Opportunity</div>
            <h1 style={{ marginBottom: 8 }}>{evaluation?.opportunity.name ?? opportunity.name}</h1>
            <div className="rule" aria-hidden="true" />
            <p className="muted small" style={{ maxWidth: '60ch' }}>
              {opportunity.description}
            </p>
          </div>

          {evaluation ? (
            <div className="card" style={{ minWidth: 260 }}>
              <div className="eyebrow">S.C.A.L.E. score</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 44, fontWeight: 800, color: 'var(--brand-navy)', lineHeight: 1 }}>
                  {evaluation.scores.total}
                </span>
                <span className="muted">/ {MAX_TOTAL}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <DecisionBadge decision={evaluation.recommendation.decision} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <Link className="button" href={`/opportunities/${id}/report?v=${evaluation.version}`}>
                  Executive report
                </Link>
                <RerunButton opportunityId={id} />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {activeRun ? (
        <section className="section">
          <RunProgress runId={activeRun.id} />
        </section>
      ) : null}

      {failedRun ? (
        <section className="section">
          <div className="card" role="alert">
            <div className="eyebrow" style={{ color: 'var(--negative)' }}>
              Last run failed
            </div>
            <h3>{failedRun.errorMessage}</h3>
            {failedRun.errorDetails?.length ? (
              <details>
                <summary className="small">Technical detail</summary>
                <ul className="mono">
                  {failedRun.errorDetails.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="muted small">Your idea was saved and can be re-run as-is.</p>
            <RerunButton opportunityId={id} />
          </div>
        </section>
      ) : null}

      {versions.length > 1 ? (
        <section className="section">
          <h2>Version history</h2>
          <div className="rule" aria-hidden="true" />
          <p className="muted small">
            Each run is saved as a new version. Nothing is overwritten.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Generated</th>
                <th scope="col">Score</th>
                <th scope="col">Recommendation</th>
                <th scope="col">Workflow</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <th scope="row" style={{ textAlign: 'left' }}>v{version.version}</th>
                  <td>{formatDate(version.createdAt)}</td>
                  <td>{version.totalScore} / {MAX_TOTAL}</td>
                  <td><DecisionBadge decision={version.decision} /></td>
                  <td className="mono">{version.workflowVersion}</td>
                  <td>
                    <Link href={`/opportunities/${id}?v=${version.version}`}>View</Link>
                    {' - '}
                    <Link href={`/opportunities/${id}/report?v=${version.version}`}>Report</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {evaluation ? (
        <>
          {selected && versions[0] && selected.version !== versions[0].version ? (
            <section className="section">
              <p className="card card--surface" role="status">
                Viewing version {selected.version} of {versions[0].version}.{' '}
                <Link href={`/opportunities/${id}`}>View the latest</Link>.
              </p>
            </section>
          ) : null}

          {evaluation.opportunity.inferredFields.length > 0 ? (
            <section className="section">
              <div className="card card--surface">
                <div className="eyebrow">Inferred from your description</div>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  You did not supply these; the evaluator inferred them. Correct them by re-running
                  with optional context filled in.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {evaluation.opportunity.inferredFields.map((field) => (
                    <span key={field} className="badge badge--inferred">{field}</span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="section">
            <SectionHeading eyebrow="02" title="Executive overview" />
            <ExecutiveOverview evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading
              eyebrow="03"
              title="Strategic vision"
              lead="Who this is for, what job they are hiring it to do, and what it would take to switch."
            />
            <CustomerSegments evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="04" title="Market context" />
            <MarketContext evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading
              eyebrow="05"
              title="Industry value chain"
              lead="Where value is created, where it is captured, and which nodes a new entrant can realistically control."
            />
            <ValueChain evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="06" title="Competitive landscape" />
            <CompetitiveLandscape evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="08" title="Innovation classification" />
            <InnovationClassification evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading
              eyebrow="09"
              title="Disruption path"
              lead="Enters at the Edge, Improves Quietly, Climbs the Value Chain, Rewrites the Value Chain."
            />
            <DisruptionPath evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading
              eyebrow="10"
              title="Strategic evaluation"
              lead="Six dimensions, each scored 1-5 with the reasoning behind it."
            />
            <Scorecard evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading
              eyebrow="11"
              title="Evidence & hypotheses"
              lead="What is sourced, what the agent reasoned, and what remains an untested belief."
            />
            <EvidenceLayer evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="12" title="Recommended experiments" />
            <Experiments evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="13" title="90-day action plan" />
            <NinetyDayPlan evaluation={evaluation} />
          </section>

          <section className="section">
            <SectionHeading eyebrow="14" title="Final recommendation" />
            <FinalRecommendation evaluation={evaluation} />
          </section>

          <section className="section">
            <h2>Sources</h2>
            <div className="rule" aria-hidden="true" />
            <SourceList evaluation={evaluation} />
            <p className="small muted" style={{ marginTop: 20 }}>
              Generated {formatDate(evaluation.createdAt)} - workflow{' '}
              <span className="mono">{evaluation.workflowVersion}</span>, prompt{' '}
              <span className="mono">{evaluation.provenance.promptVersion}</span>, schema{' '}
              <span className="mono">{evaluation.schemaVersion}</span>, template{' '}
              <span className="mono">{evaluation.templateId} v{evaluation.templateVersion}</span>,
              model <span className="mono">{evaluation.provenance.modelVersion}</span>.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
