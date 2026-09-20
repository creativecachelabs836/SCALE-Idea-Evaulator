/**
 * Template configuration for `ti_scale_executive_v1` (spec section 5 +
 * Appendix A).
 *
 * Branding is data, not CSS scattered across page-specific styles. A
 * white-label template is a different config object against the same
 * components and the same evaluation data model.
 */

export interface TemplateConfig {
  id: string;
  version: string;
  brandName: string;
  productName: string;
  logoText: string;
  footerText: string;
  disclaimer: string;
  cta?: { label: string; url?: string };
  colors: {
    primaryNavy: string;
    accentCyan: string;
    accentTeal: string;
    background: string;
    surface: string;
    ink: string;
    inkMuted: string;
    rule: string;
  };
  fonts: { display: string; body: string };
  /** Report sections in order. Set `visible: false` to drop one. */
  sections: Array<{ key: ReportSectionKey; title: string; visible: boolean }>;
}

export type ReportSectionKey =
  | 'cover'
  | 'executiveOverview'
  | 'strategicVision'
  | 'marketContext'
  | 'valueChain'
  | 'competitiveLandscape'
  | 'customerAnalysis'
  | 'innovationClassification'
  | 'disruptionPath'
  | 'strategicEvaluation'
  | 'evidenceHypotheses'
  | 'recommendedExperiments'
  | 'ninetyDayPlan'
  | 'finalRecommendation';

export const TI_SCALE_EXECUTIVE_V1: TemplateConfig = {
  id: 'ti_scale_executive_v1',
  version: '1.0',
  brandName: 'Tech Intuitions',
  productName: 'S.C.A.L.E. Strategic Evaluator',
  logoText: 'S.C.A.L.E.',
  footerText: 'Tech Intuitions - S.C.A.L.E. Strategic Evaluator',
  disclaimer:
    'This report is decision support generated from automated research and structured analysis. ' +
    'It is not investment advice and not a prediction of product success. Verify the evidence ' +
    'behind any claim before committing capital.',
  cta: { label: 'techintuitions.com' },
  colors: {
    primaryNavy: '#243F56',
    accentCyan: '#19B9D8',
    accentTeal: '#22B7B0',
    background: '#FFFFFF',
    surface: '#F3F6F8',
    ink: '#1B2E3F',
    inkMuted: '#5A6E7E',
    rule: '#D7E1E8',
  },
  fonts: {
    display: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    body: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  },
  sections: [
    { key: 'cover', title: 'Cover', visible: true },
    { key: 'executiveOverview', title: 'Executive Overview', visible: true },
    { key: 'strategicVision', title: 'Strategic Vision', visible: true },
    { key: 'marketContext', title: 'Market Context', visible: true },
    { key: 'valueChain', title: 'Industry Value Chain', visible: true },
    { key: 'competitiveLandscape', title: 'Competitive Landscape', visible: true },
    { key: 'customerAnalysis', title: 'Customer Analysis', visible: true },
    { key: 'innovationClassification', title: 'Innovation Classification', visible: true },
    { key: 'disruptionPath', title: 'Disruption Path', visible: true },
    { key: 'strategicEvaluation', title: 'Strategic Evaluation', visible: true },
    { key: 'evidenceHypotheses', title: 'Evidence & Hypotheses', visible: true },
    { key: 'recommendedExperiments', title: 'Recommended Experiments', visible: true },
    { key: 'ninetyDayPlan', title: '90-Day Action Plan', visible: true },
    { key: 'finalRecommendation', title: 'Final Recommendation', visible: true },
  ],
};

/** Emitted as CSS custom properties so print and screen share one source. */
export function templateCssVariables(config: TemplateConfig): string {
  const c = config.colors;
  return [
    `--brand-navy: ${c.primaryNavy}`,
    `--brand-cyan: ${c.accentCyan}`,
    `--brand-teal: ${c.accentTeal}`,
    `--brand-bg: ${c.background}`,
    `--brand-surface: ${c.surface}`,
    `--brand-ink: ${c.ink}`,
    `--brand-ink-muted: ${c.inkMuted}`,
    `--brand-rule: ${c.rule}`,
    `--font-display: ${config.fonts.display}`,
    `--font-body: ${config.fonts.body}`,
  ].join('; ');
}
