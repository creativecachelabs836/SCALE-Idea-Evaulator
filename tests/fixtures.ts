import type { EvaluationPayload } from '@/domain/scale-evaluation.ts';
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from '@/domain/scoring.ts';

/**
 * A minimally valid payload, for tests to mutate.
 *
 * This is scaffolding, not content: the strings are placeholders that satisfy
 * the schema, not strategic analysis. The deterministic fixture *provider* —
 * which derives believable analysis from a description — is Iteration 2. Keeping
 * this in `tests/` rather than `src/` is what stops the two being confused.
 */

const stage = () => ({
  customer: 'Placeholder customer.',
  capability: 'Placeholder capability.',
  economicAdvantage: 'Placeholder economic advantage.',
  evidence: 'Placeholder evidence.',
  assumptions: ['Placeholder assumption.'],
  risks: ['Placeholder risk.'],
});

const phase = (focus: string) => ({
  focus,
  milestones: ['Placeholder milestone.'],
  exitCriteria: 'Placeholder exit criteria.',
});

export interface FixtureOptions {
  /** Override individual dimension scores; any omitted default to 3. */
  scores?: Partial<Record<ScoreDimensionKey, number>>;
}

export function validPayload(options: FixtureOptions = {}): EvaluationPayload {
  const scores = Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [
      dimension.key,
      {
        score: options.scores?.[dimension.key] ?? 3,
        rationale: `Placeholder rationale for ${dimension.label}.`,
        claimIds: ['clm-1'],
      },
    ]),
  ) as EvaluationPayload['scores'];

  return {
    opportunity: {
      name: 'Placeholder Opportunity',
      description: 'A placeholder description used to satisfy the schema in tests.',
      industry: 'B2B software',
      targetCustomer: 'Placeholder customer',
      geography: 'North America',
      businessModel: 'Subscription',
      competitors: ['Placeholder competitor'],
      inferredFields: ['industry'],
    },
    executiveSummary: {
      problem: 'Placeholder problem.',
      targetCustomer: 'Placeholder target customer.',
      strategicThesis: 'Placeholder strategic thesis.',
      whyNow: 'Placeholder why now.',
      recommendationSummary: 'Placeholder recommendation summary.',
    },
    customerSegments: [
      {
        id: 'seg-1',
        name: 'Placeholder segment',
        jobToBeDone: 'Placeholder job to be done.',
        pains: ['Placeholder pain.'],
        alternatives: ['Placeholder alternative.'],
        economicValue: 'Placeholder economic value.',
        switchingFriction: 'Placeholder switching friction.',
        confidence: 'medium',
        claimIds: ['clm-1'],
      },
    ],
    market: {
      dynamics: [
        { title: 'Placeholder dynamic', detail: 'Placeholder detail.', confidence: 'medium', claimIds: ['clm-1'] },
      ],
      trends: [
        { title: 'Placeholder trend', detail: 'Placeholder detail.', confidence: 'low', claimIds: [] },
      ],
      risks: [
        { title: 'Placeholder risk', detail: 'Placeholder detail.', confidence: 'high', claimIds: [] },
      ],
      opportunities: [],
    },
    valueChain: [
      {
        id: 'vc-1',
        order: 1,
        name: 'First node',
        participants: ['Placeholder participant'],
        customerPain: 'Placeholder pain.',
        valueCreated: 'Placeholder value created.',
        valueCaptured: 'Placeholder value captured.',
        technologyDependencies: ['Placeholder dependency'],
        controlLevel: 'high',
        opportunitySignals: ['Placeholder signal'],
      },
      {
        id: 'vc-2',
        order: 2,
        name: 'Second node',
        participants: ['Placeholder participant'],
        customerPain: 'Placeholder pain.',
        valueCreated: 'Placeholder value created.',
        valueCaptured: 'Placeholder value captured.',
        technologyDependencies: [],
        controlLevel: 'medium',
        opportunitySignals: [],
      },
      {
        id: 'vc-3',
        order: 3,
        name: 'Third node',
        participants: [],
        customerPain: 'Placeholder pain.',
        valueCreated: 'Placeholder value created.',
        valueCaptured: 'Placeholder value captured.',
        technologyDependencies: [],
        controlLevel: 'low',
        opportunitySignals: [],
      },
    ],
    competitors: [
      {
        id: 'cmp-1',
        name: 'Placeholder competitor',
        type: 'incumbent',
        customerServed: 'Placeholder customer served.',
        valueChainPosition: 'Placeholder position.',
        advantage: 'Placeholder advantage.',
        strategicSignal: 'Placeholder signal.',
        claimIds: ['clm-1'],
      },
    ],
    innovation: {
      classification: 'sustaining',
      rationale: 'Placeholder classification rationale.',
      entryMechanism: 'Placeholder entry mechanism.',
    },
    disruptionPath: {
      edge: stage(),
      improve: stage(),
      climb: stage(),
      rewrite: stage(),
    },
    scores,
    claims: [
      {
        id: 'clm-1',
        statement: 'Placeholder claim.',
        type: 'inference',
        confidence: 'medium',
        sourceIds: ['src-1'],
        section: 'Market Context',
      },
    ],
    hypotheses: [
      {
        id: 'hyp-1',
        statement: 'Placeholder hypothesis.',
        criticality: 'high',
        linkedClaimIds: ['clm-1'],
      },
    ],
    experiments: [
      {
        id: 'exp-1',
        hypothesisId: 'hyp-1',
        experiment: 'Placeholder experiment.',
        successMetric: 'Placeholder success metric.',
        costEffort: 'low',
        durationDays: 21,
        nextDecision: 'Placeholder next decision.',
      },
    ],
    ninetyDayPlan: {
      validate: phase('Days 1-30 placeholder focus.'),
      prototype: phase('Days 31-60 placeholder focus.'),
      prove: phase('Days 61-90 placeholder focus.'),
    },
    sources: [
      {
        id: 'src-1',
        title: 'Placeholder source',
        url: 'https://example.com/placeholder',
        publisher: 'Placeholder publisher',
        sourceType: 'web',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        excerpt: 'Placeholder excerpt.',
      },
    ],
    recommendation: {
      headline: 'Placeholder headline.',
      topOpportunity: 'Placeholder top opportunity.',
      greatestRisk: 'Placeholder greatest risk.',
      criticalAssumption: 'Placeholder critical assumption.',
      nextExperiment: 'Placeholder next experiment.',
      nextDecisionDate: '2026-03-01',
      rationale: 'Placeholder recommendation rationale.',
    },
  };
}

/** A deep clone, so a mutating test cannot leak into the next one. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Escape hatch for planting values the typed payload forbids.
 *
 * Tests must be able to construct inputs a well-behaved producer never would —
 * a stringified score, a supplied total, a missing section. Going through
 * `any` here is deliberate and confined to test setup; production code never
 * needs it, because the validation boundary is what turns such input into a
 * typed payload.
 */
export function malformed(value: unknown): any {
  return value;
}
