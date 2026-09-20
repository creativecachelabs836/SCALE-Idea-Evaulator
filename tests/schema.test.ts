import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPayloadSchema, ScaleEvaluationSchema } from '../src/domain/scale-evaluation.ts';
import { validateAgentPayload, SchemaValidationError, extractJson } from '../src/agent/validate.ts';
import { buildMockPayload } from '../src/agent/mock-provider.ts';
import { computeTotal, decisionForTotal, withTotal, MAX_TOTAL } from '../src/domain/scoring.ts';
import { agentPayloadJsonSchema } from '../src/agent/json-schema.ts';
import { checkDescription, countWords } from '../src/lib/words.ts';

const DESCRIPTION =
  'A platform that lets independent physiotherapy clinics run their own insurance ' +
  'pre-authorization instead of outsourcing it to billing agencies. Clinics currently lose ' +
  'weeks of revenue to rejected claims whose reasoning they never see, and the agencies that ' +
  'handle submissions have no incentive to reduce rejection rates because they are paid per ' +
  'claim submitted rather than per claim approved. The product ingests the clinic practice ' +
  'management data, drafts the authorization packet, predicts the likelihood of rejection ' +
  'before submission, and explains which missing documentation is driving that risk so staff ' +
  'can fix it first.';

const baseRequest = { runId: 'run-test', description: DESCRIPTION };

describe('canonical schema', () => {
  test('the mock fixture satisfies the agent contract', () => {
    const result = AgentPayloadSchema.safeParse(buildMockPayload(baseRequest));
    assert.equal(result.success, true, JSON.stringify(result.error?.issues?.slice(0, 5)));
  });

  test('a payload missing a required section is rejected', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    delete payload.disruptionPath;
    assert.throws(() => validateAgentPayload(payload), SchemaValidationError);
  });

  test('an out-of-range score is rejected rather than clamped', () => {
    const payload = buildMockPayload(baseRequest);
    payload.scores.defensibility.score = 9 as never;
    assert.throws(() => validateAgentPayload(payload), SchemaValidationError);
  });

  test('a value chain with a single node is rejected', () => {
    const payload = buildMockPayload(baseRequest);
    payload.valueChain = [payload.valueChain[0]];
    assert.throws(() => validateAgentPayload(payload), SchemaValidationError);
  });
});

describe('repair', () => {
  test('a stringified score is coerced', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    (payload.scores as Record<string, Record<string, unknown>>).customerPain.score = '4';
    const result = validateAgentPayload(payload);
    assert.equal(result.payload.scores.customerPain.score, 4);
    assert.equal(result.repaired, true);
  });

  test('a bare numeric score is expanded into a scored dimension', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    (payload.scores as Record<string, unknown>).edgeStrength = 3;
    const result = validateAgentPayload(payload);
    assert.equal(result.payload.scores.edgeStrength.score, 3);
    assert.ok(result.payload.scores.edgeStrength.rationale.length > 0);
  });

  test('an enveloped payload is unwrapped', () => {
    const wrapped = { output: buildMockPayload(baseRequest) };
    const result = validateAgentPayload(wrapped);
    assert.ok(result.payload.opportunity.name.length > 0);
  });

  test('a model-supplied total is discarded, not trusted', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    (payload.scores as Record<string, unknown>).total = 30;
    const result = validateAgentPayload(payload);
    // `total` is not part of the agent contract, so it never survives parsing
    // and can never disagree with the six dimensions it is computed from.
    assert.equal('total' in result.payload.scores, false);
    assert.notEqual(withTotal(result.payload.scores).total, 30);
  });

  test('a model-supplied decision is discarded', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    (payload.recommendation as Record<string, unknown>).decision = 'INVEST';
    const result = validateAgentPayload(payload);
    assert.equal('decision' in result.payload.recommendation, false);
  });

  test('duplicate value-chain ordering is renumbered contiguously', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    const chain = payload.valueChain as Array<Record<string, unknown>>;
    const length = chain.length;
    // Every `order` of 1 is individually schema-valid, so this must be caught
    // by normalization rather than by validation.
    for (const node of chain) node.order = 1;
    const result = validateAgentPayload(payload);
    assert.deepEqual(
      result.payload.valueChain.map((n) => n.order),
      Array.from({ length }, (_, i) => i + 1),
    );
    assert.ok(result.repairNotes.some((n) => n.includes('contiguous')));
  });

  test('a gap in value-chain ordering is closed', () => {
    const payload = buildMockPayload(baseRequest) as Record<string, unknown>;
    const chain = payload.valueChain as Array<Record<string, unknown>>;
    chain.forEach((node, i) => { node.order = (i + 1) * 3; });
    const result = validateAgentPayload(payload);
    assert.deepEqual(
      result.payload.valueChain.map((n) => n.order),
      chain.map((_, i) => i + 1),
    );
  });

  test('out-of-sequence nodes are sorted before renumbering', () => {
    const payload = buildMockPayload(baseRequest);
    const names = payload.valueChain.map((n) => n.name);
    payload.valueChain = [...payload.valueChain].reverse().map((node, i) => ({
      ...node,
      order: payload.valueChain.length - i,
    }));
    const result = validateAgentPayload(payload);
    // Original sequence is recovered from `order`, not from array position.
    assert.deepEqual(result.payload.valueChain.map((n) => n.name), names);
  });

  test('citations pointing at unknown sources are pruned', () => {
    const payload = buildMockPayload(baseRequest);
    payload.claims[0].sourceIds = ['src-1', 'src-does-not-exist'];
    const result = validateAgentPayload(payload);
    assert.deepEqual(result.payload.claims[0].sourceIds, ['src-1']);
    assert.ok(result.repairNotes.some((n) => n.includes('unknown ids')));
  });

  test('prose wrapping a fenced JSON block is tolerated', () => {
    const payload = buildMockPayload(baseRequest);
    const raw = `Here is the evaluation:\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\nLet me know.`;
    const result = validateAgentPayload(raw);
    assert.equal(result.payload.opportunity.description, DESCRIPTION);
  });

  test('a response with no JSON at all is rejected', () => {
    assert.throws(() => validateAgentPayload('I cannot help with that.'), SchemaValidationError);
    assert.equal(extractJson('no json here'), null);
  });
});

describe('scoring', () => {
  test('the total is the sum of the six dimensions', () => {
    const payload = buildMockPayload(baseRequest);
    const scores = withTotal(payload.scores);
    const expected =
      payload.scores.marketAttractiveness.score +
      payload.scores.customerPain.score +
      payload.scores.edgeStrength.score +
      payload.scores.valueChainLeverage.score +
      payload.scores.defensibility.score +
      payload.scores.speedToMarket.score;
    assert.equal(scores.total, expected);
    assert.equal(computeTotal(payload.scores), expected);
  });

  test('decision bands match the documented thresholds', () => {
    assert.equal(decisionForTotal(30), 'INVEST');
    assert.equal(decisionForTotal(24), 'INVEST');
    assert.equal(decisionForTotal(23), 'REFINE');
    assert.equal(decisionForTotal(18), 'REFINE');
    assert.equal(decisionForTotal(17), 'RECONSIDER');
    assert.equal(decisionForTotal(6), 'RECONSIDER');
  });

  test('every band is covered across the full legal range', () => {
    for (let total = 6; total <= MAX_TOTAL; total++) {
      assert.ok(['INVEST', 'REFINE', 'RECONSIDER'].includes(decisionForTotal(total)));
    }
  });
});

describe('intake gate', () => {
  test('the 75-word minimum is enforced', () => {
    assert.equal(checkDescription('too short', 75, 500).ok, false);
    assert.equal(checkDescription(DESCRIPTION, 75, 500).ok, true);
  });

  test('the maximum is enforced', () => {
    const long = Array.from({ length: 600 }, () => 'word').join(' ');
    const result = checkDescription(long, 75, 500);
    assert.equal(result.ok, false);
    assert.match(result.message ?? '', /under 500 words/);
  });

  test('word counting ignores irregular whitespace', () => {
    assert.equal(countWords('  one\n\ntwo\t three  '), 3);
    assert.equal(countWords('   '), 0);
  });
});

describe('structured-output JSON schema', () => {
  const schema = agentPayloadJsonSchema();

  test('every object forbids additional properties and requires all keys', () => {
    const problems: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`));
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const obj = node as Record<string, unknown>;

      if (obj.type === 'object' && obj.properties) {
        if (obj.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
        const keys = Object.keys(obj.properties as Record<string, unknown>);
        const required = (obj.required as string[]) ?? [];
        if (keys.length !== required.length) problems.push(`${path}: required mismatch`);
      }
      for (const [key, value] of Object.entries(obj)) walk(value, `${path}.${key}`);
    };
    walk(schema, '<root>');
    assert.deepEqual(problems, []);
  });

  test('keywords strict mode rejects are stripped', () => {
    const serialized = JSON.stringify(schema);
    for (const keyword of ['maxLength', 'minLength', 'minimum', 'maximum', 'default', 'minItems']) {
      assert.equal(serialized.includes(`"${keyword}"`), false, `found ${keyword}`);
    }
  });

  test('the schema still describes the six scoring dimensions', () => {
    const scores = (schema.properties as Record<string, Record<string, unknown>>).scores;
    assert.deepEqual(Object.keys(scores.properties as Record<string, unknown>).sort(), [
      'customerPain',
      'defensibility',
      'edgeStrength',
      'marketAttractiveness',
      'speedToMarket',
      'valueChainLeverage',
    ]);
  });
});

describe('determinism', () => {
  test('the same description yields the same evaluation', () => {
    const a = buildMockPayload(baseRequest);
    const b = buildMockPayload(baseRequest);
    assert.deepEqual(a.scores, b.scores);
  });

  test('different descriptions yield different analyses', () => {
    const other = buildMockPayload({
      runId: 'run-2',
      description:
        'A marketplace matching small-scale coffee growers in Central America directly with ' +
        'independent roasters in Europe, replacing the exporter and importer layers that ' +
        'currently take most of the margin. Growers cannot access price transparency and have ' +
        'no way to prove provenance, so they are paid commodity rates for specialty-grade ' +
        'lots. The platform handles quality grading, logistics, settlement and provenance ' +
        'attestation so a roaster can buy a single lot from a named farm with confidence.',
    });
    const base = buildMockPayload(baseRequest);
    assert.notDeepEqual(base.scores, other.scores);
    assert.notEqual(base.opportunity.name, other.opportunity.name);
  });
});

describe('persisted envelope', () => {
  test('a fully assembled evaluation validates against the persisted schema', () => {
    const payload = validateAgentPayload(buildMockPayload(baseRequest)).payload;
    const scores = withTotal(payload.scores);
    const candidate = {
      evaluationId: 'eval-1',
      opportunityId: 'opp-1',
      organizationId: 'org-1',
      runId: 'run-1',
      version: 1,
      createdAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      templateId: 'ti_scale_executive_v1',
      templateVersion: '1.0',
      workflowVersion: 'mock:scale-thesis-v1',
      ...payload,
      scores,
      recommendation: { ...payload.recommendation, decision: decisionForTotal(scores.total) },
      provenance: {
        provider: 'mock',
        workflowVersion: 'mock:scale-thesis-v1',
        promptVersion: 'scale-thesis-v1',
        modelVersion: 'mock-fixture-1',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 10,
        retryCount: 0,
        toolCallCount: 0,
        repaired: false,
      },
    };
    const result = ScaleEvaluationSchema.safeParse(candidate);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues?.slice(0, 5)));
  });
});
