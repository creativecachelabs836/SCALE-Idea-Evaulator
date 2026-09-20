import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <section className="section">
        <div className="eyebrow">404</div>
        <h1>That page does not exist</h1>
        <div className="rule" aria-hidden="true" />
        <p className="muted">
          The evaluation may belong to a different workspace, or it may have been removed.
        </p>
        <Link className="button" href="/">
          Start a new evaluation
        </Link>
      </section>
    </div>
  );
}
