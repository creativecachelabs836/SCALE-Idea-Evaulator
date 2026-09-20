import { config } from '@/lib/config';
import { IdeaForm } from '@/components/IdeaForm';
import { SectionHeading } from '@/components/primitives';

export const dynamic = 'force-dynamic';

/**
 * Intake (FR-01, AC-01).
 *
 * The product promise is that a description is the only thing a user has to
 * supply. Optional context exists but stays collapsed, so the default path is
 * one field and one button.
 */
export default function HomePage() {
  return (
    <div className="shell">
      <section className="section">
        <SectionHeading
          eyebrow="Idea to thesis"
          title="Describe your idea. Get a strategic thesis."
          lead={`Write at least ${config.minDescriptionWords} words about what you want to build and who it is for. The evaluator researches the market, maps the value chain, classifies the innovation, scores six dimensions, and produces a branded executive report with its evidence attached.`}
        />

        <IdeaForm
          minWords={config.minDescriptionWords}
          maxWords={config.maxDescriptionWords}
        />
      </section>

      <section className="section">
        <h2>What you get</h2>
        <div className="rule" aria-hidden="true" />
        <div className="grid grid--3">
          {[
            {
              title: 'Researched context',
              body: 'Industry structure, incumbents, market dynamics, technology shifts and growth signals, with sources retained.',
            },
            {
              title: 'Customer & value chain',
              body: 'Segments with jobs to be done and switching friction, and an ordered value chain showing where value is created and captured.',
            },
            {
              title: 'Innovation classification',
              body: 'Sustaining or potentially disruptive, argued rather than assumed, with the Edge to Rewrite path laid out.',
            },
            {
              title: 'Six-factor scorecard',
              body: 'Market attractiveness, customer pain, edge strength, value-chain leverage, defensibility and speed to market, scored 1-5 with rationale.',
            },
            {
              title: 'Evidence layer',
              body: 'Every claim labelled evidence, inference or hypothesis with a confidence level, so you can see what is known and what is assumed.',
            },
            {
              title: 'Experiments & 90-day plan',
              body: 'The critical assumptions turned into experiments you can actually run, then a Validate / Prototype / Prove plan.',
            },
          ].map((item) => (
            <article key={item.title} className="card">
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
