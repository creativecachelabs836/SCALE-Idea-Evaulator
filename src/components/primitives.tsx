import type { ReactNode } from 'react';
import type { Claim, Source } from '@/domain/scale-evaluation';
import type { ClaimType, Confidence } from '@/domain/enums';

/**
 * Presentation primitives shared by the interactive views and the executive
 * report, so a claim badge or a score meter looks and behaves identically in
 * the browser, in print, and in the PDF (spec section 5 rendering behavior).
 *
 * All server components: none of this needs interactivity.
 */

export function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h2>{title}</h2>
      <div className="rule" aria-hidden="true" />
      {lead ? <p className="muted">{lead}</p> : null}
    </header>
  );
}

const CLAIM_LABEL: Record<ClaimType, string> = {
  evidence: 'Evidence',
  inference: 'Inference',
  hypothesis: 'Hypothesis',
};

/**
 * FR-09 / AC-05: an inference must never read as a sourced fact. The label is
 * text, not colour alone, so it survives greyscale printing and screen readers.
 */
export function ClaimBadge({ type }: { type: ClaimType }) {
  return (
    <span className={`badge badge--${type}`}>
      <span className="visually-hidden">Claim type: </span>
      {CLAIM_LABEL[type]}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className={`badge badge--${level}`}>
      <span className="visually-hidden">Confidence: </span>
      {level} confidence
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`badge badge--${decision.toLowerCase()}`}>
      <span className="visually-hidden">Recommendation: </span>
      {decision}
    </span>
  );
}

/** A 1-5 score rendered as discrete pips; the number is always present too. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  return (
    <div
      className="meter"
      role="img"
      aria-label={`${label}: ${score} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((pip) => (
        <span key={pip} className={`meter__pip${pip <= score ? ' meter__pip--on' : ''}`} />
      ))}
    </div>
  );
}

/**
 * Inline citation markers. Links stay live in both the browser and the PDF
 * (spec section 5); `data-cite` lets print styles append the bare URL.
 */
export function Citations({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: Source[];
}) {
  const resolved = sourceIds
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is Source => Boolean(s));

  if (resolved.length === 0) return null;

  return (
    <span className="small muted">
      {' '}
      {resolved.map((source, i) => {
        const index = sources.indexOf(source) + 1;
        const label = `[${index}]`;
        return (
          <span key={source.id}>
            {i > 0 ? ' ' : ''}
            {source.url ? (
              <a href={source.url} data-cite target="_blank" rel="noreferrer noopener" title={source.title}>
                {label}
              </a>
            ) : (
              <span title={source.title}>{label}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** A claim with its type, confidence and citations attached. */
export function ClaimLine({ claim, sources }: { claim: Claim; sources: Source[] }) {
  return (
    <li className="avoid-break" style={{ marginBottom: 10 }}>
      <span>{claim.statement}</span>
      <Citations sourceIds={claim.sourceIds} sources={sources} />
      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <ClaimBadge type={claim.type} />
        <ConfidenceBadge level={claim.confidence} />
      </div>
    </li>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h4>{label}</h4>
      <div>{children}</div>
    </div>
  );
}

export function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="muted small">None identified.</p>;
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
