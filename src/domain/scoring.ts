import type { Decision } from './enums';

/**
 * The six-dimension scorecard and the recommendation heuristic (SPEC §3).
 *
 * Principle P2 lives here: the total and the decision are computed, never
 * taken from whatever produced the analysis. A recommendation that disagrees
 * with its own scorecard is worse than no recommendation, and this is the one
 * part of the product that has no reason to be probabilistic.
 */

export const SCORE_DIMENSIONS = [
  {
    key: 'marketAttractiveness',
    label: 'Market Attractiveness',
    anchoredIn: 'Size, growth, margin structure, timing.',
  },
  {
    key: 'customerPain',
    label: 'Customer Pain',
    anchoredIn: 'Frequency, severity, economic impact.',
  },
  {
    key: 'edgeStrength',
    label: 'Edge Strength',
    anchoredIn: 'Quality of the entry wedge.',
  },
  {
    key: 'valueChainLeverage',
    label: 'Value-Chain Leverage',
    anchoredIn: 'Control and economic position of the node attacked.',
  },
  {
    key: 'defensibility',
    label: 'Defensibility',
    anchoredIn: 'Whether the advantage compounds or erodes.',
  },
  {
    key: 'speedToMarket',
    label: 'Speed to Market',
    anchoredIn: 'Feasibility and testability in the near term.',
  },
] as const;

export type ScoreDimensionKey = (typeof SCORE_DIMENSIONS)[number]['key'];

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** 6 dimensions x 5 = 30. Derived, so it cannot fall out of step. */
export const MAX_TOTAL = SCORE_DIMENSIONS.length * MAX_SCORE;
export const MIN_TOTAL = SCORE_DIMENSIONS.length * MIN_SCORE;

/**
 * Product heuristics from SPEC §3. Ordered high to low and read as the first
 * band whose floor the total reaches, so the bands cannot develop a gap or an
 * overlap the way an explicit min/max pair can.
 */
export const DECISION_BANDS = [
  { decision: 'INVEST' as const, min: 24 },
  { decision: 'REFINE' as const, min: 18 },
  { decision: 'RECONSIDER' as const, min: Number.NEGATIVE_INFINITY },
] as const;

/** Any shape carrying the six dimensions. Keeps scoring independent of the schema. */
export type DimensionScores = Record<ScoreDimensionKey, { score: number }>;

export function computeTotal(scores: DimensionScores): number {
  return SCORE_DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension.key].score, 0);
}

export function decisionForTotal(total: number): Decision {
  const band = DECISION_BANDS.find((candidate) => total >= candidate.min);
  // The final band has no floor, so this is unreachable; it exists because the
  // compiler cannot know that, and throwing beats returning a wrong decision.
  if (!band) throw new Error(`No decision band matched a total of ${total}.`);
  return band.decision;
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
 * Shown wherever a recommendation appears. SPEC §3 requires the product to
 * state plainly that this is decision support rather than a prediction.
 */
export const DECISION_DISCLAIMER =
  'This recommendation is decision support, not a prediction of product success. ' +
  'Scores are analytical judgements derived from the evidence gathered at the time of ' +
  'this run. Review the rationale and sources behind each dimension before acting.';
