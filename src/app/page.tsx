import { CURRENT_ITERATION, ITERATIONS } from '@/lib/iterations';

/**
 * Iteration 0 landing page.
 *
 * Deliberately minimal: it states the product promise and shows where we are on
 * the roadmap. It will be replaced by the intake form in Iteration 3.
 */
export default function HomePage() {
  return (
    <div className="shell">
      <header className="masthead">
        <p className="wordmark">
          S.C.A.L.E. <span>STRATEGIC EVALUATOR</span>
        </p>
        <h1>Describe your idea in 75 words. Get a strategic thesis.</h1>
        <div className="rule" aria-hidden="true" />
        <p className="lead">
          Autonomous research, customer analysis, value-chain mapping, innovation
          classification and a six-factor evaluation — with every claim labelled
          as evidence, inference or hypothesis so you can see what is known and
          what is assumed.
        </p>
      </header>

      <section aria-labelledby="roadmap-heading">
        <h2 id="roadmap-heading">Build roadmap</h2>
        <p className="lead">
          This application is being built iteratively. The plan, the methodology
          and the acceptance criteria for each step live in{' '}
          <code>SPEC.md</code>.
        </p>

        <ol className="roadmap">
          {ITERATIONS.map((iteration) => {
            const state =
              iteration.number < CURRENT_ITERATION
                ? 'done'
                : iteration.number === CURRENT_ITERATION
                  ? 'current'
                  : 'upcoming';
            return (
              <li key={iteration.number} className="roadmap__item" data-state={state}>
                <span className="roadmap__number" aria-hidden="true">
                  {iteration.number}
                </span>
                <div>
                  <h3>
                    {iteration.title}
                    {state === 'current' ? (
                      <span className="badge">In progress</span>
                    ) : state === 'done' ? (
                      <span className="badge badge--done">Complete</span>
                    ) : null}
                  </h3>
                  <p>{iteration.goal}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
