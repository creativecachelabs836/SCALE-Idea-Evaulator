'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell">
      <section className="section">
        <div className="eyebrow" style={{ color: 'var(--negative)' }}>
          Something went wrong
        </div>
        <h1>This page could not be displayed</h1>
        <div className="rule" aria-hidden="true" />
        <p className="muted">
          Your saved evaluations are unaffected. Try again, or return to your workspace.
        </p>
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
