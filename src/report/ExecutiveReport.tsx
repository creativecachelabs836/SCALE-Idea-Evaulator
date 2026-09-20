import type { ReactNode } from 'react';
import type { ScaleEvaluation } from '@/domain/scale-evaluation';
import { MAX_TOTAL } from '@/domain/scoring';
import { TI_SCALE_EXECUTIVE_V1, type TemplateConfig } from './template-config';
import { formatDate } from '@/components/primitives';
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

/**
 * ti_scale_executive_v1 (spec section 5).
 *
 * The 14 required sections placed onto fixed US-Letter sheets. Rendering is
 * deterministic and entirely data-driven: the model supplies content, this
 * template decides layout. Section order and visibility come from the template
 * config, so a white-label variant needs no change to the data model and no
 * change to these components.
 */

interface PageProps {
  config: TemplateConfig;
  kicker: string;
  sectionNumber: string;
  children: ReactNode;
  footerLeft: string;
  pageNumber: number;
  totalPages: number;
}

function Page({ config, kicker, sectionNumber, children, footerLeft, pageNumber, totalPages }: PageProps) {
  return (
    <section className="page" aria-label={kicker}>
      <div className="page__header">
        <span className="kicker">{kicker}</span>
        <span className="section-no">{sectionNumber}</span>
      </div>
      <div className="page__body">{children}</div>
      <footer className="page__footer">
        <span>{footerLeft}</span>
        <span>{config.footerText}</span>
        <span>
          {pageNumber} / {totalPages}
        </span>
      </footer>
    </section>
  );
}

function Cover({ evaluation, config }: { evaluation: ScaleEvaluation; config: TemplateConfig }) {
  const { opportunity, scores, recommendation } = evaluation;

  return (
    <section className="page cover" aria-label="Cover">
      <div>
        <div className="cover__brand">
          {config.logoText} <span>STRATEGIC EVALUATOR</span>
        </div>
        <div className="cover__rule" aria-hidden="true" />
        <h1 className="cover__title">{opportunity.name}</h1>
        <p className="cover__subtitle">{recommendation.headline}</p>
      </div>

      <div>
        <div className="cover__score">
          <div>
            <div style={{ fontSize: '7.5pt', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7 }}>
              S.C.A.L.E. score
            </div>
            <span className="value">{scores.total}</span>
            <span className="of"> / {MAX_TOTAL}</span>
          </div>
          <div className="decision">
            <strong>{recommendation.decision}</strong>
            <span>Recommendation</span>
          </div>
        </div>

        <dl className="cover__meta">
          <div>
            <dt>Industry</dt>
            <dd>{opportunity.industry ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Target customer</dt>
            <dd>{opportunity.targetCustomer ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Geography</dt>
            <dd>{opportunity.geography ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Business model</dt>
            <dd>{opportunity.businessModel ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Prepared by</dt>
            <dd>{config.brandName} - {config.productName}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(evaluation.createdAt)}</dd>
          </div>
        </dl>

        <p className="disclaimer" style={{ marginTop: 24 }}>
          {config.disclaimer}
        </p>
      </div>

      <footer className="page__footer">
        <span>
          Version {evaluation.version} - {evaluation.templateId} v{evaluation.templateVersion}
        </span>
        <span>{config.cta?.label ?? config.brandName}</span>
        <span>1</span>
      </footer>
    </section>
  );
}

export function ExecutiveReport({
  evaluation,
  config = TI_SCALE_EXECUTIVE_V1,
}: {
  evaluation: ScaleEvaluation;
  config?: TemplateConfig;
}) {
  const visible = new Set(config.sections.filter((s) => s.visible).map((s) => s.key));
  const footerLeft = evaluation.opportunity.name;

  // Sheets are declared explicitly rather than flowed, so pagination in the
  // browser preview is identical to the exported PDF (AC-09).
  const sheets: Array<{ key: string; kicker: string; no: string; content: ReactNode }> = [];

  const add = (key: string, kicker: string, no: string, content: ReactNode) => {
    if (visible.has(key as never)) sheets.push({ key, kicker, no, content });
  };

  add('executiveOverview', 'Executive Overview', '02', <ExecutiveOverview evaluation={evaluation} />);
  add(
    'strategicVision',
    'Strategic Vision',
    '03',
    <>
      <p className="muted">
        Customer segments, the job each is hiring this opportunity to do, and the value proposition
        that follows.
      </p>
      <CustomerSegments evaluation={evaluation} />
    </>,
  );
  add('marketContext', 'Market Context', '04', <MarketContext evaluation={evaluation} />);
  add('valueChain', 'Industry Value Chain', '05', <ValueChain evaluation={evaluation} />);
  add('competitiveLandscape', 'Competitive Landscape', '06', <CompetitiveLandscape evaluation={evaluation} />);
  add(
    'innovationClassification',
    'Innovation Classification',
    '08',
    <InnovationClassification evaluation={evaluation} />,
  );
  add('disruptionPath', 'Disruption Path', '09', <DisruptionPath evaluation={evaluation} />);
  add('strategicEvaluation', 'Strategic Evaluation', '10', <Scorecard evaluation={evaluation} />);
  add('evidenceHypotheses', 'Evidence & Hypotheses', '11', <EvidenceLayer evaluation={evaluation} />);
  add('recommendedExperiments', 'Recommended Experiments', '12', <Experiments evaluation={evaluation} />);
  add('ninetyDayPlan', '90-Day Action Plan', '13', <NinetyDayPlan evaluation={evaluation} />);
  add(
    'finalRecommendation',
    'Final Recommendation',
    '14',
    <>
      <FinalRecommendation evaluation={evaluation} />
      <h4 style={{ marginTop: 20 }}>Sources</h4>
      <SourceList evaluation={evaluation} />
      <p className="disclaimer" style={{ marginTop: 16 }}>
        Generated {formatDate(evaluation.createdAt)} using workflow {evaluation.workflowVersion},
        prompt {evaluation.provenance.promptVersion}, schema {evaluation.schemaVersion}, template{' '}
        {evaluation.templateId} v{evaluation.templateVersion}. {config.disclaimer}
      </p>
    </>,
  );

  const totalPages = sheets.length + (visible.has('cover') ? 1 : 0);

  return (
    <div className="report">
      {visible.has('cover') ? <Cover evaluation={evaluation} config={config} /> : null}
      {sheets.map((sheet, i) => (
        <Page
          key={sheet.key}
          config={config}
          kicker={sheet.kicker}
          sectionNumber={sheet.no}
          footerLeft={footerLeft}
          pageNumber={i + (visible.has('cover') ? 2 : 1)}
          totalPages={totalPages}
        >
          {sheet.content}
        </Page>
      ))}
    </div>
  );
}
