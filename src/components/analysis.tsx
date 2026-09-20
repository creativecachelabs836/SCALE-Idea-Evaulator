import type { ScaleEvaluation } from '@/domain/scale-evaluation';
import { SCORE_DIMENSIONS, MAX_TOTAL, DECISION_COPY, DECISION_DISCLAIMER } from '@/domain/scoring';
import {
  Bullets,
  Citations,
  ClaimBadge,
  ClaimLine,
  ConfidenceBadge,
  DecisionBadge,
  KeyValue,
  ScoreMeter,
} from './primitives';

/**
 * The analysis component library (spec section 5: "use a single component
 * library for interactive web mode, print mode, and PDF mode").
 *
 * Each export renders one analytical concern from the canonical evaluation and
 * nothing else - no page chrome, no layout assumptions. The interactive view
 * stacks them in a scrolling page; the executive report places the same
 * components onto fixed 8.5x11 sheets. Neither owns the markup.
 */

type Props = { evaluation: ScaleEvaluation };

export function ExecutiveOverview({ evaluation }: Props) {
  const { executiveSummary: summary } = evaluation;
  return (
    <div className="grid grid--2">
      <KeyValue label="The problem">{summary.problem}</KeyValue>
      <KeyValue label="Target customer">{summary.targetCustomer}</KeyValue>
      <KeyValue label="Strategic thesis">{summary.strategicThesis}</KeyValue>
      <KeyValue label="Why now">{summary.whyNow}</KeyValue>
      <div style={{ gridColumn: '1 / -1' }}>
        <KeyValue label="Recommendation">{summary.recommendationSummary}</KeyValue>
      </div>
    </div>
  );
}

export function CustomerSegments({ evaluation }: Props) {
  return (
    <div className="grid grid--2">
      {evaluation.customerSegments.map((segment) => (
        <article key={segment.id} className="card avoid-break">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
            <h3 style={{ margin: 0 }}>{segment.name}</h3>
            <ConfidenceBadge level={segment.confidence} />
          </div>
          <p style={{ marginTop: 8 }}>
            <strong>Job to be done. </strong>
            {segment.jobToBeDone}
            <Citations sourceIds={[]} sources={evaluation.sources} />
          </p>
          <KeyValue label="Pains">
            <Bullets items={segment.pains} />
          </KeyValue>
          <KeyValue label="Alternatives today">
            <Bullets items={segment.alternatives} />
          </KeyValue>
          <div className="grid grid--2" style={{ marginTop: 8 }}>
            <KeyValue label="Economic value">
              <span className="small">{segment.economicValue}</span>
            </KeyValue>
            <KeyValue label="Switching friction">
              <span className="small">{segment.switchingFriction}</span>
            </KeyValue>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MarketContext({ evaluation }: Props) {
  const groups = [
    { key: 'dynamics', label: 'Market dynamics', items: evaluation.market.dynamics },
    { key: 'trends', label: 'Industry & technology trends', items: evaluation.market.trends },
    { key: 'risks', label: 'Structural risks', items: evaluation.market.risks },
    { key: 'opportunities', label: 'Opportunities', items: evaluation.market.opportunities },
  ] as const;

  return (
    <div className="grid grid--2">
      {groups.map((group) => (
        <section key={group.key} className="avoid-break">
          <h4>{group.label}</h4>
          {group.items.length === 0 ? (
            <p className="muted small">None identified.</p>
          ) : (
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {group.items.map((item, i) => (
                <li key={i} style={{ marginBottom: 10 }}>
                  <strong>{item.title}. </strong>
                  {item.detail}
                  <Citations
                    sourceIds={item.claimIds.flatMap(
                      (id) => evaluation.claims.find((c) => c.id === id)?.sourceIds ?? [],
                    )}
                    sources={evaluation.sources}
                  />{' '}
                  <ConfidenceBadge level={item.confidence} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** FR-05: the ordered chain plus the detail behind each node. */
export function ValueChain({ evaluation }: Props) {
  const nodes = [...evaluation.valueChain].sort((a, b) => a.order - b.order);

  return (
    <>
      <ol className="chain" aria-label="Industry value chain, in order" style={{ listStyle: 'none', padding: 0 }}>
        {nodes.map((node) => (
          <li key={node.id} className="chain__node" data-control={node.controlLevel}>
            <strong>{node.name}</strong>
            <span className="muted">{node.controlLevel} control</span>
          </li>
        ))}
      </ol>
      <table>
        <caption className="visually-hidden">Value chain nodes and the opportunity at each</caption>
        <thead>
          <tr>
            <th scope="col">Node</th>
            <th scope="col">Participants</th>
            <th scope="col">Customer pain</th>
            <th scope="col">Value created / captured</th>
            <th scope="col">Opportunity signals</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id} className="avoid-break">
              <th scope="row" style={{ textAlign: 'left', fontWeight: 700 }}>
                {node.order}. {node.name}
              </th>
              <td>{node.participants.join(', ') || '--'}</td>
              <td>{node.customerPain}</td>
              <td>
                <div>{node.valueCreated}</div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  Captured: {node.valueCaptured}
                </div>
              </td>
              <td>{node.opportunitySignals.join('; ') || '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function CompetitiveLandscape({ evaluation }: Props) {
  if (evaluation.competitors.length === 0) {
    return <p className="muted">No competitors were identified for this opportunity.</p>;
  }
  return (
    <table>
      <caption className="visually-hidden">Competitive landscape</caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Customer served</th>
          <th scope="col">Value-chain position</th>
          <th scope="col">Advantage</th>
          <th scope="col">Strategic signal</th>
        </tr>
      </thead>
      <tbody>
        {evaluation.competitors.map((competitor) => (
          <tr key={competitor.id} className="avoid-break">
            <th scope="row" style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700 }}>{competitor.name}</div>
              <span className="badge">{competitor.type.replace(/_/g, ' ')}</span>
            </th>
            <td>{competitor.customerServed}</td>
            <td>{competitor.valueChainPosition}</td>
            <td>{competitor.advantage}</td>
            <td>{competitor.strategicSignal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** FR-06: the classification and, crucially, why it is not the other one. */
export function InnovationClassification({ evaluation }: Props) {
  const { innovation } = evaluation;
  const label =
    innovation.classification === 'sustaining' ? 'Sustaining' : 'Potentially disruptive';

  return (
    <div className="card card--surface avoid-break">
      <div className="eyebrow">Classification</div>
      <h3 style={{ marginBottom: 12 }}>{label}</h3>
      <p>{innovation.rationale}</p>
      <KeyValue label="Entry mechanism">{innovation.entryMechanism}</KeyValue>
    </div>
  );
}

const PATH_STAGES = [
  { key: 'edge', label: 'Enters at the Edge' },
  { key: 'improve', label: 'Improves Quietly' },
  { key: 'climb', label: 'Climbs the Value Chain' },
  { key: 'rewrite', label: 'Rewrites the Value Chain' },
] as const;

export function DisruptionPath({ evaluation }: Props) {
  return (
    <ol className="path" style={{ listStyle: 'none', padding: 0 }}>
      {PATH_STAGES.map((stage, i) => {
        const data = evaluation.disruptionPath[stage.key];
        return (
          <li key={stage.key} className="path__stage avoid-break">
            <h4>
              {i + 1}. {stage.label}
            </h4>
            <dl>
              <dt>Customer</dt>
              <dd>{data.customer}</dd>
              <dt>Capability</dt>
              <dd>{data.capability}</dd>
              <dt>Economic advantage</dt>
              <dd>{data.economicAdvantage}</dd>
              <dt>Key assumption</dt>
              <dd>{data.assumptions[0] ?? 'None recorded.'}</dd>
              <dt>Key risk</dt>
              <dd>{data.risks[0] ?? 'None recorded.'}</dd>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

/** FR-08 / AC-06: every score shows its reasoning, not just its number. */
export function Scorecard({ evaluation }: Props) {
  const { scores, recommendation } = evaluation;
  const copy = DECISION_COPY[recommendation.decision];

  return (
    <>
      <div role="table" aria-label="Six-dimension strategic evaluation">
        <div role="row" className="visually-hidden">
          <span role="columnheader">Dimension</span>
          <span role="columnheader">Score out of 5</span>
          <span role="columnheader">Rationale</span>
        </div>
        {SCORE_DIMENSIONS.map((dimension) => {
          const value = scores[dimension.key];
          return (
            <div role="row" key={dimension.key} className="scorecard__row avoid-break">
              <div role="cell">
                <div className="scorecard__label">{dimension.label}</div>
                <ScoreMeter score={value.score} label={dimension.label} />
              </div>
              <div role="cell" className="scorecard__value">
                {value.score}
                <small>/5</small>
              </div>
              <div role="cell">
                {value.rationale}
                <Citations
                  sourceIds={value.claimIds.flatMap(
                    (id) => evaluation.claims.find((c) => c.id === id)?.sourceIds ?? [],
                  )}
                  sources={evaluation.sources}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="scorecard__total">
        <div>
          <div style={{ fontSize: '8pt', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75 }}>
            Total S.C.A.L.E. score
          </div>
          <span className="n">{scores.total}</span>
          <span style={{ opacity: 0.6 }}> / {MAX_TOTAL}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14pt', fontWeight: 800, letterSpacing: '0.06em' }}>
            {recommendation.decision}
          </div>
          <div style={{ fontSize: '8pt', opacity: 0.8, maxWidth: '3.2in' }}>{copy.summary}</div>
        </div>
      </div>

      <p className="disclaimer" style={{ marginTop: 14 }}>
        {DECISION_DISCLAIMER}
      </p>
    </>
  );
}

/** FR-09 / AC-05: the evidence layer, made inspectable. */
export function EvidenceLayer({ evaluation }: Props) {
  const byType = {
    evidence: evaluation.claims.filter((c) => c.type === 'evidence'),
    inference: evaluation.claims.filter((c) => c.type === 'inference'),
    hypothesis: evaluation.claims.filter((c) => c.type === 'hypothesis'),
  };

  return (
    <>
      <div className="grid grid--3" style={{ marginBottom: 16 }}>
        {(['evidence', 'inference', 'hypothesis'] as const).map((type) => (
          <div key={type} className="card card--surface avoid-break">
            <ClaimBadge type={type} />
            <div style={{ fontSize: '22pt', fontWeight: 800, color: 'var(--brand-navy)', lineHeight: 1.1 }}>
              {byType[type].length}
            </div>
            <div className="small muted">
              {type === 'evidence'
                ? 'Retrieved from a citable source.'
                : type === 'inference'
                  ? 'Reasoned from evidence by the agent.'
                  : 'Untested belief requiring validation.'}
            </div>
          </div>
        ))}
      </div>

      {evaluation.claims.length > 0 && (
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {evaluation.claims.map((claim) => (
            <ClaimLine key={claim.id} claim={claim} sources={evaluation.sources} />
          ))}
        </ul>
      )}

      {evaluation.hypotheses.length > 0 && (
        <>
          <h4 style={{ marginTop: 16 }}>Open hypotheses</h4>
          <ul>
            {evaluation.hypotheses.map((hypothesis) => (
              <li key={hypothesis.id} className="avoid-break">
                {hypothesis.statement}{' '}
                <span className={`badge badge--${hypothesis.criticality}`}>
                  {hypothesis.criticality} criticality
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** FR-10: assumptions converted into things that can actually be run. */
export function Experiments({ evaluation }: Props) {
  if (evaluation.experiments.length === 0) {
    return <p className="muted">No experiments were recommended.</p>;
  }
  return (
    <table>
      <caption className="visually-hidden">Recommended experiments</caption>
      <thead>
        <tr>
          <th scope="col">Hypothesis</th>
          <th scope="col">Experiment</th>
          <th scope="col">Success metric</th>
          <th scope="col">Cost</th>
          <th scope="col">Days</th>
          <th scope="col">Next decision</th>
        </tr>
      </thead>
      <tbody>
        {evaluation.experiments.map((experiment) => {
          const hypothesis = evaluation.hypotheses.find((h) => h.id === experiment.hypothesisId);
          return (
            <tr key={experiment.id} className="avoid-break">
              <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                {hypothesis?.statement ?? '--'}
              </th>
              <td>{experiment.experiment}</td>
              <td>{experiment.successMetric}</td>
              <td style={{ textTransform: 'capitalize' }}>{experiment.costEffort}</td>
              <td>{experiment.durationDays}</td>
              <td>{experiment.nextDecision}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function NinetyDayPlan({ evaluation }: Props) {
  const phases = [
    { key: 'validate', label: 'Days 1-30 - Validate', data: evaluation.ninetyDayPlan.validate },
    { key: 'prototype', label: 'Days 31-60 - Prototype', data: evaluation.ninetyDayPlan.prototype },
    { key: 'prove', label: 'Days 61-90 - Prove', data: evaluation.ninetyDayPlan.prove },
  ] as const;

  return (
    <div className="grid grid--3">
      {phases.map((phase) => (
        <section key={phase.key} className="card avoid-break">
          <div className="eyebrow">{phase.label}</div>
          <p>{phase.data.focus}</p>
          <h4>Milestones</h4>
          <Bullets items={phase.data.milestones} />
          <h4>Exit criteria</h4>
          <p className="small">{phase.data.exitCriteria}</p>
        </section>
      ))}
    </div>
  );
}

export function FinalRecommendation({ evaluation }: Props) {
  const { recommendation, scores } = evaluation;
  return (
    <div className="avoid-break">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <DecisionBadge decision={recommendation.decision} />
        <span className="muted small">
          {scores.total} / {MAX_TOTAL}
        </span>
      </div>
      <h3>{recommendation.headline}</h3>
      <p>{recommendation.rationale}</p>
      <div className="grid grid--2" style={{ marginTop: 12 }}>
        <KeyValue label="Top opportunity">{recommendation.topOpportunity}</KeyValue>
        <KeyValue label="Greatest risk">{recommendation.greatestRisk}</KeyValue>
        <KeyValue label="Critical assumption">{recommendation.criticalAssumption}</KeyValue>
        <KeyValue label="Next experiment">{recommendation.nextExperiment}</KeyValue>
      </div>
      {recommendation.nextDecisionDate ? (
        <p style={{ marginTop: 12 }}>
          <strong>Next decision date: </strong>
          {recommendation.nextDecisionDate}
        </p>
      ) : null}
    </div>
  );
}

export function SourceList({ evaluation }: Props) {
  if (evaluation.sources.length === 0) {
    return <p className="muted">No sources were retrieved for this evaluation.</p>;
  }
  return (
    <ol className="small">
      {evaluation.sources.map((source) => (
        <li key={source.id} className="avoid-break" style={{ marginBottom: 6 }}>
          {source.url ? (
            <a href={source.url} data-cite target="_blank" rel="noreferrer noopener">
              {source.title}
            </a>
          ) : (
            source.title
          )}
          {source.publisher ? <span className="muted"> - {source.publisher}</span> : null}
          {source.retrievedAt ? (
            <span className="muted"> - retrieved {source.retrievedAt.slice(0, 10)}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
