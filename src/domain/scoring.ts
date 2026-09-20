import type { Decision } from './enums';
import type { Scores, ScoresInput } from './scale-evaluation';

/**
 * Six-factor scoring and the recommendation heuristic (spec section 6).
 *
 * Both the total and the decision are computed here rather than taken from the
 * model. A recommendation that disagrees with its own scorecard is worse than
 * no recommendation, and the arithmetic is the one part of this product that
 * has no reason to be probabilistic.
 */

export const SCORE_DIMENSIONS = [
  {
    key: 'marketAttractiveness',
    label: 'Market Attractiveness',
    requirement: 'Score plus evidence-backed rationale.',
  },
  {
    key: 'customerPain',
    label: 'Customer Pain',
    requirement: 'Score plus frequency/severity/economic impact reasoning.',
  },
  {
    key: 'edgeStrength',
    label: 'Edge Strength',
    requirement: 'Score plus entry-wedge rationale.',
  },
  {
    key: 'valueChainLeverage',
    label: 'Value-Chain Leverage',
    requirement: 'Score plus control/economic position rationale.',
  },
  {
    key: 'defensibility',
    label: 'Defensibility',
    requirement: 'Score plus compounding advantage rationale.',
  },
  {
    key: 'speedToMarket',
    label: 'Speed to Market',
    requirement: 'Score plus feasibility/testability rationale.',
  },
] as const;

export type ScoreDimensionKey = (typeof SCORE_DIMENSIONS)[number]['key'];

export const MAX_TOTAL = SCORE_DIMENSIONS.length * 5; // 30

/** Product heuristics from spec section 6. */
export const DECISION_THRESHOLDS = [
  { decision: 'INVEST' as const, min: 24, max: 30 },
  { decision: 'REFINE' as const, min: 18, max: 23 },
  { decision: 'RECONSIDER' as const, min: 0, max: 17 },
];

export function computeTotal(scores: ScoresInput): number {
  return SCORE_DIMENSIONS.reduce((sum, d) => sum + scores[d.key].score, 0);
}

export function decisionForTotal(total: number): Decision {
  const band = DECISION_THRESHOLDS.find((b) => total >= b.min && total <= b.max);
  // Every total from 6-30 falls in a band; the fallback keeps the type total.
  return band ? band.decision : 'RECONSIDER';
}

export function withTotal(scores: ScoresInput): Scores {
  return { ...scores, total: computeTotal(scores) };
}

export const DECISION_COPY: Record<
  Decision,
  { label: string; summary: string; tone: 'positive' | 'caution' | 'negative' }
> = {
  INVEST: {
    label: 'Invest',
    summary:
      'The evidence supports committing resources to the next stage of validation.',
    tone: 'positive',
  },
  REFINE: {
    label: 'Refine',
    summary:
      'The opportunity is credible but one or more dimensions need sharpening before commitment.',
    tone: 'caution',
  },
  RECONSIDER: {
    label: 'Reconsider',
    summary:
      'As currently framed the opportunity does not justify significant engineering or capital.',
    tone: 'negative',
  },
};

/**
 * Shown next to every recommendation. The spec is explicit that this is
 * decision support, not a prediction of product success, and the UI is required
 * to say so.
 */
export const DECISION_DISCLAIMER =
  'This recommendation is decision support, not a prediction of product success. ' +
  'Scores are analytical judgements derived from the evidence gathered at the time of ' +
  'this run. Review the rationale and sources behind each dimension before acting.';
