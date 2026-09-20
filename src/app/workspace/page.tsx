import Link from 'next/link';
import { getSession } from '@/lib/session';
import * as repo from '@/data/repositories';
import { MAX_TOTAL } from '@/domain/scoring';
import { DecisionBadge, SectionHeading, formatDate } from '@/components/primitives';

export const dynamic = 'force-dynamic';

/**
 * The workspace (FR-11, AC-08): every saved opportunity, its latest score, and
 * whether a run is currently in flight.
 */
export default async function WorkspacePage() {
  const session = await getSession();
  // Middleware normally guarantees a session; without one there is simply
  // nothing saved yet, which is the same thing this page shows for a new user.
  const opportunities = session ? repo.listOpportunities(session.organizationId) : [];

  return (
    <div className="shell">
      <section className="section">
        <SectionHeading
          eyebrow="Workspace"
          title="Your evaluations"
          lead="Every opportunity you have evaluated, with its full run history. Reruns add versions; nothing is overwritten."
        />

        {opportunities.length === 0 ? (
          <div className="card card--surface">
            <h3>No evaluations yet</h3>
            <p className="muted">
              Describe an idea in 75 words and the evaluator will produce a full strategic thesis.
            </p>
            <Link className="button" href="/">
              Start an evaluation
            </Link>
          </div>
        ) : (
          <table>
            <caption className="visually-hidden">Saved opportunities</caption>
            <thead>
              <tr>
                <th scope="col">Opportunity</th>
                <th scope="col">Created</th>
                <th scope="col">Score</th>
                <th scope="col">Recommendation</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opportunity) => (
                <tr key={opportunity.id}>
                  <th scope="row" style={{ textAlign: 'left' }}>
                    <Link href={`/opportunities/${opportunity.id}`} style={{ fontWeight: 700 }}>
                      {opportunity.name}
                    </Link>
                    {opportunity.latest ? (
                      <div className="muted small">version {opportunity.latest.version}</div>
                    ) : null}
                  </th>
                  <td>{formatDate(opportunity.createdAt)}</td>
                  <td>
                    {opportunity.latest
                      ? `${opportunity.latest.totalScore} / ${MAX_TOTAL}`
                      : '--'}
                  </td>
                  <td>
                    {opportunity.latest ? (
                      <DecisionBadge decision={opportunity.latest.decision} />
                    ) : (
                      '--'
                    )}
                  </td>
                  <td>
                    {opportunity.activeRun ? (
                      <span className="badge badge--medium">{opportunity.activeRun.status}</span>
                    ) : opportunity.latest ? (
                      <span className="badge badge--high">completed</span>
                    ) : (
                      <span className="badge badge--low">no evaluation</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/opportunities/${opportunity.id}`}>Open</Link>
                    {opportunity.latest ? (
                      <>
                        {' - '}
                        <Link href={`/opportunities/${opportunity.id}/report`}>Report</Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
