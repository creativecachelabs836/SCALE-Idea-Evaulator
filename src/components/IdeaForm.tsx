'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkDescription, countWords } from '@/lib/words';

/**
 * The intake form. One required field.
 *
 * The word counter is a live courtesy; the server re-checks the same rule via
 * the shared `checkDescription`, so a client bypass changes nothing.
 */
export function IdeaForm({ minWords, maxWords }: { minWords: number; maxWords: number }) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [optional, setOptional] = useState({
    name: '',
    industry: '',
    targetCustomer: '',
    geography: '',
    businessModel: '',
    competitors: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const check = useMemo(
    () => checkDescription(description, minWords, maxWords),
    [description, minWords, maxWords],
  );
  const words = countWords(description);
  const progress = Math.min(1, words / minWords);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!check.ok || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          name: optional.name || undefined,
          industry: optional.industry || undefined,
          targetCustomer: optional.targetCustomer || undefined,
          geography: optional.geography || undefined,
          businessModel: optional.businessModel || undefined,
          competitors: optional.competitors
            ? optional.competitors.split(',').map((c) => c.trim()).filter(Boolean)
            : undefined,
          // Guards against a double submit creating two upstream runs.
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        }),
      });

      const body = (await response.json()) as { opportunityId?: string; error?: string };

      if (!response.ok) {
        setError(body.error ?? 'Could not start the evaluation. Please try again.');
        setSubmitting(false);
        return;
      }

      startTransition(() => router.push(`/opportunities/${body.opportunityId}`));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="description">
        Describe your idea
        <span className="muted" style={{ fontWeight: 400 }}>
          {' '}
          - what it is, who it is for, and why now
        </span>
      </label>

      <textarea
        id="description"
        name="description"
        rows={9}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="A tool that lets independent physiotherapy clinics run their own insurance pre-authorization instead of outsourcing it. Clinics lose weeks of revenue to rejected claims they never see the reasoning for..."
        aria-describedby="word-counter description-help"
        required
      />

      <div id="description-help" className="small muted" style={{ marginTop: 6 }}>
        This is the only field we need. Anything you leave out below is inferred from your
        description and labelled as inferred in the report.
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>
        <div
          id="word-counter"
          role="status"
          aria-live="polite"
          className="small"
          style={{ marginTop: 6, color: check.ok ? 'var(--positive)' : 'var(--brand-ink-muted)' }}
        >
          {check.ok
            ? `${words} words - ready to evaluate.`
            : (check.message ?? `${words} / ${minWords} words`)}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          className="button button--secondary"
          aria-expanded={showOptional}
          aria-controls="optional-fields"
          onClick={() => setShowOptional((v) => !v)}
        >
          {showOptional ? 'Hide' : 'Add'} optional context
        </button>
      </div>

      {showOptional ? (
        <fieldset
          id="optional-fields"
          style={{ border: 0, padding: 0, margin: '16px 0 0' }}
        >
          <legend className="visually-hidden">Optional context</legend>
          <div className="grid grid--2">
            {(
              [
                ['name', 'Opportunity name'],
                ['industry', 'Industry'],
                ['targetCustomer', 'Target customer'],
                ['geography', 'Geography'],
                ['businessModel', 'Business model'],
                ['competitors', 'Known competitors (comma separated)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  type="text"
                  value={optional[key]}
                  onChange={(e) => setOptional((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--negative)', marginTop: 16 }}>
          {error}
        </p>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <button type="submit" className="button" disabled={!check.ok || submitting}>
          {submitting ? 'Starting evaluation...' : 'Evaluate this idea'}
        </button>
      </div>
    </form>
  );
}
