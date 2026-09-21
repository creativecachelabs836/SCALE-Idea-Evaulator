import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvaluationPayloadSchema,
  REQUIRED_PAYLOAD_SECTIONS,
  ScaleEvaluationSchema,
  SCHEMA_VERSION,
} from '@/domain/scale-evaluation.ts';
import {
  SchemaValidationError,
  extractJson,
  validateEvaluationPayload,
} from '@/domain/validation.ts';
import { assembleEvaluation } from '@/domain/assemble.ts';
import {
  DECISION_BANDS,
  MAX_TOTAL,
  MIN_TOTAL,
  SCORE_DIMENSIONS,
  computeTotal,
  decisionForTotal,
} from '@/domain/scoring.ts';
import { clone, malformed, validPayload } from './fixtures.ts';

/**
 * Iteration 1 acceptance: the evaluation contract.
 *
 * Each `describe` block below maps to an acceptance criterion in SPEC.md.
 * This suite *is* the iteration's demo — there is no UI to look at yet.
 */

/* --- A valid payload validates; a missing section is rejected ------------ */

describe('a valid payload validates', () => {
  test('the fixture satisfies the producer contract', () => {
    const result = EvaluationPayloadSchema.safeParse(validPayload());
    assert.equal(result.success, true, JSON.stringify(result.error?.issues.slice(0, 5)));
  });

  test('validation reports no repair for an already-clean payload', () => {
    const result = validateEvaluationPayload(validPayload());
    assert.equal(result.repaired, false);
    assert.deepEqual(result.notes, []);
  });

  test('every required section is genuinely required', () => {
    // Covers all ten sections rather than spot-checking one, so a section that
    // silently becomes optional cannot slip through.
    for (const section of REQUIRED_PAYLOAD_SECTIONS) {
      const payload = clone(validPayload()) as Record<string, unknown>;
      delete payload[section];
      assert.throws(
        () => validateEvaluationPayload(payload),
        SchemaValidationError,
        `removing "${section}" should have been rejected`,
      );
    }
  });

  test('a payload with too few value-chain nodes is rejected', () => {
    const payload = clone(validPayload());
    payload.valueChain = [payload.valueChain[0]!];
    assert.throws(() => validateEvaluationPayload(payload), SchemaValidationError);
  });

  test('a payload with no customer segments is rejected', () => {
    const payload = clone(validPayload());
    payload.customerSegments = [];
    assert.throws(() => validateEvaluationPayload(payload), SchemaValidationError);
  });

  test('empty-string content is rejected, not accepted as present', () => {
    const payload = clone(validPayload());
    payload.executiveSummary.problem = '   ';
    assert.throws(() => validateEvaluationPayload(payload), SchemaValidationError);
  });

  test('an unparseable input is rejected', () => {
    assert.throws(() => validateEvaluationPayload('I cannot help with that.'), SchemaValidationError);
    assert.equal(extractJson('no json here'), null);
  });

  test('a payload wrapped in prose and a code fence is recovered', () => {
    const raw = `Here you go:\n\n\`\`\`json\n${JSON.stringify(validPayload())}\n\`\`\`\nHope that helps.`;
    const result = validateEvaluationPayload(raw);
    assert.equal(result.payload.opportunity.name, 'Placeholder Opportunity');
  });
});

/* --- An out-of-range score is rejected, not clamped ---------------------- */

describe('an out-of-range score is rejected, not clamped', () => {
  for (const invalid of [0, 6, -1, 99, 2.5]) {
    test(`a score of ${invalid} is rejected`, () => {
      const payload = clone(validPayload());
      payload.scores.defensibility.score = invalid;
      assert.throws(() => validateEvaluationPayload(payload), SchemaValidationError);
    });
  }

  test('a rejected score is never silently corrected', () => {
    const payload = clone(validPayload());
    payload.scores.customerPain.score = 9;
    try {
      validateEvaluationPayload(payload);
      assert.fail('expected the payload to be rejected');
    } catch (error) {
      assert.ok(error instanceof SchemaValidationError);
      assert.ok(
        error.issues.some((issue) => issue.startsWith('scores.customerPain.score')),
        `issues should name the offending path, got: ${error.issues.join('; ')}`,
      );
    }
  });

  test('a stringified score is coerced rather than rejected', () => {
    const payload = clone(validPayload());
    malformed(payload).scores.edgeStrength.score = '4';
    const result = validateEvaluationPayload(payload);
    assert.equal(result.payload.scores.edgeStrength.score, 4);
    assert.equal(result.repaired, true);
  });

  test('a bare number is expanded into a scored dimension', () => {
    const payload = clone(validPayload());
    malformed(payload).scores.speedToMarket = 2;
    const result = validateEvaluationPayload(payload);
    assert.equal(result.payload.scores.speedToMarket.score, 2);
    assert.ok(result.payload.scores.speedToMarket.rationale.length > 0);
  });
});

/* --- A supplied total or decision is discarded (P2) ---------------------- */

describe('a supplied total or decision is discarded', () => {
  test('scores.total never survives parsing', () => {
    const payload = clone(validPayload());
    malformed(payload).scores.total = 30;

    const result = validateEvaluationPayload(payload);
    assert.equal('total' in result.payload.scores, false);
    // The drop must also be *recorded*, so that a producer violating the
    // contract is visible rather than silently tolerated.
    assert.ok(result.notes.some((note) => note.includes('scores.total')));
    assert.equal(result.repaired, true);
  });

  test('recommendation.decision never survives parsing', () => {
    const payload = clone(validPayload());
    malformed(payload).recommendation.decision = 'INVEST';

    const result = validateEvaluationPayload(payload);
    assert.equal('decision' in result.payload.recommendation, false);
    assert.ok(result.notes.some((note) => note.includes('recommendation.decision')));
    assert.equal(result.repaired, true);
  });

  test('a flattering supplied total cannot override the real one', () => {
    // Scores summing to 12 -> RECONSIDER, whatever the producer claimed.
    const payload = clone(
      validPayload({
        scores: {
          marketAttractiveness: 2,
          customerPain: 2,
          edgeStrength: 2,
          valueChainLeverage: 2,
          defensibility: 2,
          speedToMarket: 2,
        },
      }),
    );
    malformed(payload).scores.total = 30;
    malformed(payload).recommendation.decision = 'INVEST';

    const evaluation = assembleEvaluation(validateEvaluationPayload(payload).payload);
    assert.equal(evaluation.scores.total, 12);
    assert.equal(evaluation.recommendation.decision, 'RECONSIDER');
  });
});

/* --- Value-chain ordering is normalized (P3) ----------------------------- */

describe('value-chain ordering is normalized', () => {
  test('duplicate ordering is renumbered, though each value is legal alone', () => {
    const payload = clone(validPayload());
    for (const node of payload.valueChain) node.order = 1;

    const result = validateEvaluationPayload(payload);
    assert.deepEqual(
      result.payload.valueChain.map((node) => node.order),
      [1, 2, 3],
    );
    assert.ok(result.notes.some((note) => note.includes('contiguous')));
  });

  test('a gapped sequence is closed', () => {
    const payload = clone(validPayload());
    payload.valueChain.forEach((node, index) => {
      node.order = (index + 1) * 5;
    });

    const result = validateEvaluationPayload(payload);
    assert.deepEqual(
      result.payload.valueChain.map((node) => node.order),
      [1, 2, 3],
    );
  });

  test('nodes are sorted by order, not by array position', () => {
    const payload = clone(validPayload());
    const names = payload.valueChain.map((node) => node.name);
    payload.valueChain.reverse(); // order values stay attached to their nodes

    const result = validateEvaluationPayload(payload);
    assert.deepEqual(result.payload.valueChain.map((node) => node.name), names);
  });

  test('array position always matches order, even with nothing to renumber', () => {
    const result = validateEvaluationPayload(validPayload());
    result.payload.valueChain.forEach((node, index) => {
      assert.equal(node.order, index + 1);
    });
  });
});

/* --- Dangling citations are pruned (P3) ---------------------------------- */

describe('citations pointing at unknown sources are pruned', () => {
  test('an unknown source id is dropped from a claim', () => {
    const payload = clone(validPayload());
    payload.claims[0]!.sourceIds = ['src-1', 'src-does-not-exist'];

    const result = validateEvaluationPayload(payload);
    assert.deepEqual(result.payload.claims[0]!.sourceIds, ['src-1']);
    assert.ok(result.notes.some((note) => note.includes('unknown ids')));
  });

  test('an unknown claim id is dropped wherever it is referenced', () => {
    const payload = clone(validPayload());
    payload.customerSegments[0]!.claimIds = ['clm-1', 'clm-nope'];
    payload.competitors[0]!.claimIds = ['clm-nope'];
    payload.scores.defensibility.claimIds = ['clm-nope'];
    payload.market.dynamics[0]!.claimIds = ['clm-nope'];
    payload.hypotheses[0]!.linkedClaimIds = ['clm-nope'];

    const result = validateEvaluationPayload(payload);
    assert.deepEqual(result.payload.customerSegments[0]!.claimIds, ['clm-1']);
    assert.deepEqual(result.payload.competitors[0]!.claimIds, []);
    assert.deepEqual(result.payload.scores.defensibility.claimIds, []);
    assert.deepEqual(result.payload.market.dynamics[0]!.claimIds, []);
    assert.deepEqual(result.payload.hypotheses[0]!.linkedClaimIds, []);
  });

  test('an experiment pointing at an unknown hypothesis loses the link', () => {
    const payload = clone(validPayload());
    payload.experiments[0]!.hypothesisId = 'hyp-nope';

    const result = validateEvaluationPayload(payload);
    assert.equal(result.payload.experiments[0]!.hypothesisId, undefined);
  });

  test('valid references are left alone', () => {
    const result = validateEvaluationPayload(validPayload());
    assert.deepEqual(result.payload.claims[0]!.sourceIds, ['src-1']);
    assert.equal(result.payload.experiments[0]!.hypothesisId, 'hyp-1');
  });

  test('duplicate ids are an error, not a repair', () => {
    // Which of two identical ids a citation meant cannot be guessed, so this
    // is rejected rather than normalized.
    const payload = clone(validPayload());
    payload.claims.push({ ...payload.claims[0]! });
    assert.throws(() => validateEvaluationPayload(payload), SchemaValidationError);
  });
});

/* --- Decision bands are correct at every boundary ------------------------ */

describe('decision bands', () => {
  test('the documented boundaries hold', () => {
    assert.equal(decisionForTotal(30), 'INVEST');
    assert.equal(decisionForTotal(24), 'INVEST');
    assert.equal(decisionForTotal(23), 'REFINE');
    assert.equal(decisionForTotal(18), 'REFINE');
    assert.equal(decisionForTotal(17), 'RECONSIDER');
    assert.equal(decisionForTotal(6), 'RECONSIDER');
  });

  test('every reachable total resolves to a decision', () => {
    for (let total = MIN_TOTAL; total <= MAX_TOTAL; total++) {
      const decision = decisionForTotal(total);
      assert.ok(
        ['INVEST', 'REFINE', 'RECONSIDER'].includes(decision),
        `total ${total} produced ${decision}`,
      );
    }
  });

  test('bands are monotonic: a higher total never yields a worse decision', () => {
    const rank = { RECONSIDER: 0, REFINE: 1, INVEST: 2 } as const;
    for (let total = MIN_TOTAL; total < MAX_TOTAL; total++) {
      assert.ok(
        rank[decisionForTotal(total + 1)] >= rank[decisionForTotal(total)],
        `decision regressed between ${total} and ${total + 1}`,
      );
    }
  });

  test('bands leave no gap and no overlap', () => {
    const floors = DECISION_BANDS.map((band) => band.min).filter(Number.isFinite);
    for (const floor of floors) {
      assert.notEqual(
        decisionForTotal(floor),
        decisionForTotal(floor - 1),
        `the band at ${floor} does not actually change the decision`,
      );
    }
  });
});

/* --- P7: sweep the input space, not one example -------------------------- */

describe('scoring across the whole input space', () => {
  /**
   * Exhaustive rather than sampled: all 5^6 = 15,625 score combinations. A
   * previous version of this product shipped a bug that only appeared for half
   * of all inputs while every test passed, because each test used one hand-picked
   * example. Where the space is small enough to enumerate, enumerate it (P7).
   */
  test('total always equals the sum, for every combination', () => {
    const values = [1, 2, 3, 4, 5];
    let checked = 0;

    const walk = (index: number, picked: number[]): void => {
      if (index === SCORE_DIMENSIONS.length) {
        const scores = Object.fromEntries(
          SCORE_DIMENSIONS.map((dimension, i) => [dimension.key, { score: picked[i]! }]),
        );

        const expected = picked.reduce((sum, value) => sum + value, 0);
        const total = computeTotal(malformed(scores));
        assert.equal(total, expected);
        assert.ok(total >= MIN_TOTAL && total <= MAX_TOTAL);
        checked += 1;
        return;
      }
      for (const value of values) walk(index + 1, [...picked, value]);
    };

    walk(0, []);
    assert.equal(checked, values.length ** SCORE_DIMENSIONS.length);
  });

  test('assembly agrees with the scorecard for every band', () => {
    const cases: Array<[number, string]> = [
      [5, 'INVEST'],      // 30
      [4, 'INVEST'],      // 24
      [3, 'REFINE'],      // 18
      [2, 'RECONSIDER'],  // 12
      [1, 'RECONSIDER'],  // 6
    ];

    for (const [value, expected] of cases) {
      const scores = Object.fromEntries(
        SCORE_DIMENSIONS.map((dimension) => [dimension.key, value]),
      ) as Record<string, number>;

      const evaluation = assembleEvaluation(validPayload({ scores: malformed(scores) }));
      assert.equal(evaluation.scores.total, value * SCORE_DIMENSIONS.length);
      assert.equal(evaluation.recommendation.decision, expected);
    }
  });
});

/* --- Assembly ------------------------------------------------------------ */

describe('assembly', () => {
  test('produces a schema-valid evaluation', () => {
    const evaluation = assembleEvaluation(validateEvaluationPayload(validPayload()).payload);
    const result = ScaleEvaluationSchema.safeParse(evaluation);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues.slice(0, 5)));
  });

  test('stamps identity and schema version', () => {
    const evaluation = assembleEvaluation(validPayload(), {
      evaluationId: 'eval-fixed',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(evaluation.evaluationId, 'eval-fixed');
    assert.equal(evaluation.createdAt, '2026-01-01T00:00:00.000Z');
    assert.equal(evaluation.schemaVersion, SCHEMA_VERSION);
  });

  test('generates a distinct id when none is supplied', () => {
    const first = assembleEvaluation(validPayload());
    const second = assembleEvaluation(validPayload());
    assert.notEqual(first.evaluationId, second.evaluationId);
    assert.ok(first.evaluationId.length > 0);
  });

  test('carries the analysis through unchanged', () => {
    const payload = validPayload();
    const evaluation = assembleEvaluation(payload);
    assert.deepEqual(evaluation.customerSegments, payload.customerSegments);
    assert.deepEqual(evaluation.disruptionPath, payload.disruptionPath);
    assert.equal(evaluation.recommendation.headline, payload.recommendation.headline);
  });
});
