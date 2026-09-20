import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Data-layer tests.
 *
 * The database path is read from the environment when `@/lib/config` is first
 * imported, so it is set before the repository module is loaded dynamically
 * below. Each run gets its own temporary file: these tests assert on version
 * numbers and rate-limit counts, both of which a shared database would make
 * order-dependent.
 */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-repo-test-'));
process.env.SCALE_DB_PATH = path.join(dir, 'test.db');

const repo = await import('../src/data/repositories.ts');
const { buildMockPayload } = await import('../src/agent/mock-provider.ts');
const { validateAgentPayload } = await import('../src/agent/validate.ts');
const { withTotal, decisionForTotal } = await import('../src/domain/scoring.ts');
const { ScaleEvaluationSchema } = await import('../src/domain/scale-evaluation.ts');

const DESCRIPTION =
  'A platform that lets independent physiotherapy clinics run their own insurance ' +
  'pre-authorization instead of outsourcing it to billing agencies. Clinics currently lose ' +
  'weeks of revenue to rejected claims whose reasoning they never see, and the agencies that ' +
  'handle submissions have no incentive to reduce rejection rates because they are paid per ' +
  'claim submitted rather than per claim approved. The product ingests the clinic practice ' +
  'management data, drafts the authorization packet, predicts the likelihood of rejection ' +
  'before submission, and explains which missing documentation is driving that risk so staff ' +
  'can fix it first.';

const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbb';
const USER_A = 'usr_aaaaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'usr_bbbbbbbbbbbbbbbbbbbbbbbb';

before(() => {
  for (const [org, user] of [
    [ORG_A, USER_A],
    [ORG_B, USER_B],
  ]) {
    repo.ensureOrganization(org, 'Test Workspace');
    repo.ensureUser({ id: user, organizationId: org, role: 'owner' });
  }
});

after(() => {
  repo.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

function newOpportunity(organizationId: string, createdBy: string, name = 'Physio pre-auth') {
  return repo.createOpportunity({
    organizationId,
    createdBy,
    name,
    description: DESCRIPTION,
    intake: { industry: 'Healthcare' },
  });
}

function newRun(opportunityId: string, organizationId: string, createdBy: string, idempotencyKey?: string) {
  return repo.createRun({
    opportunityId,
    organizationId,
    createdBy,
    provider: 'mock',
    workflowVersion: 'mock:scale-thesis-v1',
    promptVersion: 'scale-thesis-v1',
    schemaVersion: '1.0.0',
    templateId: 'ti_scale_executive_v1',
    templateVersion: '1.0',
    idempotencyKey,
  });
}

/** Assemble a valid evaluation the way the orchestrator does. */
function buildEvaluation(opportunityId: string, organizationId: string, runId: string, version: number) {
  const payload = validateAgentPayload(buildMockPayload({ runId, description: DESCRIPTION })).payload;
  const scores = withTotal(payload.scores);
  const timestamp = new Date().toISOString();

  return ScaleEvaluationSchema.parse({
    evaluationId: `eval-${runId}`,
    opportunityId,
    organizationId,
    runId,
    version,
    createdAt: timestamp,
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
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 10,
      retryCount: 0,
      toolCallCount: 0,
      repaired: false,
    },
  });
}

describe('tenancy', () => {
  test("one workspace cannot read another's opportunity", () => {
    const opportunity = newOpportunity(ORG_A, USER_A);

    assert.ok(repo.getOpportunity(ORG_A, opportunity.id));
    assert.equal(repo.getOpportunity(ORG_B, opportunity.id), null);
  });

  test("one workspace cannot read another's run or evaluation", () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);
    repo.saveEvaluation(buildEvaluation(opportunity.id, ORG_A, run.id, repo.nextEvaluationVersion(opportunity.id)));
    const [summary] = repo.listEvaluationSummaries(ORG_A, opportunity.id);

    assert.ok(repo.getRun(ORG_A, run.id));
    assert.equal(repo.getRun(ORG_B, run.id), null);
    assert.ok(repo.getEvaluation(ORG_A, summary.id));
    assert.equal(repo.getEvaluation(ORG_B, summary.id), null);
    assert.deepEqual(repo.listEvaluationSummaries(ORG_B, opportunity.id), []);
  });

  test('the workspace list is scoped to its own tenant', () => {
    newOpportunity(ORG_B, USER_B, 'Only in B');
    const namesInA = repo.listOpportunities(ORG_A).map((row) => row.name);

    assert.ok(!namesInA.includes('Only in B'));
    assert.ok(repo.listOpportunities(ORG_B).some((row) => row.name === 'Only in B'));
  });
});

describe('evaluation versioning', () => {
  test('a rerun appends a version and never overwrites the first', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);

    const firstRun = newRun(opportunity.id, ORG_A, USER_A);
    repo.saveEvaluation(buildEvaluation(opportunity.id, ORG_A, firstRun.id, repo.nextEvaluationVersion(opportunity.id)));

    const secondRun = newRun(opportunity.id, ORG_A, USER_A);
    repo.saveEvaluation(buildEvaluation(opportunity.id, ORG_A, secondRun.id, repo.nextEvaluationVersion(opportunity.id)));

    const summaries = repo.listEvaluationSummaries(ORG_A, opportunity.id);
    assert.equal(summaries.length, 2);
    // Newest first: pages treat index 0 as current.
    assert.deepEqual(summaries.map((s) => s.version), [2, 1]);
    assert.equal(repo.nextEvaluationVersion(opportunity.id), 3);
    assert.ok(repo.getEvaluation(ORG_A, summaries[1].id), 'version 1 is still readable');
  });

  test('the latest summary matches the newest version', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);
    repo.saveEvaluation(buildEvaluation(opportunity.id, ORG_A, run.id, repo.nextEvaluationVersion(opportunity.id)));

    const latest = repo.getLatestEvaluationSummary(ORG_A, opportunity.id);
    assert.equal(latest?.version, 1);
    assert.equal(latest?.decision, repo.listEvaluationSummaries(ORG_A, opportunity.id)[0].decision);
  });

  test('a stored evaluation round-trips unchanged', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);
    const original = buildEvaluation(opportunity.id, ORG_A, run.id, repo.nextEvaluationVersion(opportunity.id));
    repo.saveEvaluation(original);

    const loaded = repo.getEvaluation(ORG_A, original.evaluationId);
    assert.deepEqual(loaded, original);
  });

  test('saving an evaluation completes its run', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);
    assert.equal(run.status, 'queued');

    repo.saveEvaluation(buildEvaluation(opportunity.id, ORG_A, run.id, repo.nextEvaluationVersion(opportunity.id)));

    const completed = repo.getRun(ORG_A, run.id);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.progress, 1);
    assert.ok(completed?.completedAt);
    assert.equal(repo.getActiveRun(ORG_A, opportunity.id), null);
  });

  test('normalized evidence is written alongside the payload', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);
    const evaluation = buildEvaluation(opportunity.id, ORG_A, run.id, repo.nextEvaluationVersion(opportunity.id));
    repo.saveEvaluation(evaluation);

    repo.recordRunTelemetry(run.id, { sourceCount: evaluation.sources.length, schemaValid: true });
    const stored = repo.getRun(ORG_A, run.id);

    assert.equal(stored?.sourceCount, evaluation.sources.length);
    assert.equal(stored?.schemaValid, true);
  });
});

describe('runs', () => {
  test('an in-flight run is reported as active, a finished one is not', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);

    repo.updateRunProgress(run.id, {
      status: 'researching',
      stageIndex: 1,
      stageLabel: 'Researching industry',
      progress: 0.12,
    });

    const active = repo.getActiveRun(ORG_A, opportunity.id);
    assert.equal(active?.id, run.id);
    assert.equal(active?.status, 'researching');
    assert.equal(active?.stageLabel, 'Researching industry');

    repo.markRunFailed(run.id, 'Provider unavailable.', ['503 from upstream']);
    assert.equal(repo.getActiveRun(ORG_A, opportunity.id), null);

    const failed = repo.getRun(ORG_A, run.id);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.errorMessage, 'Provider unavailable.');
    assert.deepEqual(failed?.errorDetails, ['503 from upstream']);
  });

  test('progress without a stage label keeps the previous one', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);

    repo.updateRunProgress(run.id, {
      status: 'researching',
      stageIndex: 1,
      stageLabel: 'Researching industry',
      progress: 0.12,
    });
    // The retry path re-queues without a label.
    repo.updateRunProgress(run.id, { status: 'queued', stageIndex: 0, progress: 0.02 });

    assert.equal(repo.getRun(ORG_A, run.id)?.stageLabel, 'Researching industry');
  });

  test('an idempotency key resolves to the run it already created', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A, 'key-123');

    assert.equal(repo.getRunByIdempotencyKey(ORG_A, 'key-123')?.id, run.id);
    // Scoped per tenant: the same key in another workspace is unrelated.
    assert.equal(repo.getRunByIdempotencyKey(ORG_B, 'key-123'), null);
  });

  test('a run whose heartbeat has gone quiet is reaped as failed', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);

    // Nothing is stale yet.
    repo.reapStaleRuns(15 * 60_000);
    assert.equal(repo.getRun(ORG_A, run.id)?.status, 'queued');

    // A zero-millisecond threshold makes every open run stale.
    const reaped = repo.reapStaleRuns(0);
    assert.ok(reaped >= 1);

    const after = repo.getRun(ORG_A, run.id);
    assert.equal(after?.status, 'failed');
    assert.match(after?.errorMessage ?? '', /interrupted/i);
  });

  test('telemetry accumulates instead of clearing what it does not carry', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const run = newRun(opportunity.id, ORG_A, USER_A);

    repo.recordRunTelemetry(run.id, { modelVersion: 'mock-fixture-1', inputTokens: 1200 });
    repo.recordRunTelemetry(run.id, { outputTokens: 3400, schemaValid: false, retryCount: 2 });

    const stored = repo.getRun(ORG_A, run.id);
    assert.equal(stored?.modelVersion, 'mock-fixture-1');
    assert.equal(stored?.inputTokens, 1200);
    assert.equal(stored?.outputTokens, 3400);
    assert.equal(stored?.schemaValid, false);
    assert.equal(stored?.retryCount, 2);
  });

  test('runs are listed newest first', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    const first = newRun(opportunity.id, ORG_A, USER_A);
    repo.markRunFailed(first.id, 'failed');
    const second = newRun(opportunity.id, ORG_A, USER_A);

    const runs = repo.listRuns(ORG_A, opportunity.id);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].id, second.id);
  });
});

describe('workspace list', () => {
  test('an opportunity carries its latest score and any in-flight run', () => {
    const opportunity = newOpportunity(ORG_B, USER_B, 'Listed opportunity');
    const run = newRun(opportunity.id, ORG_B, USER_B);
    const evaluation = buildEvaluation(opportunity.id, ORG_B, run.id, repo.nextEvaluationVersion(opportunity.id));
    repo.saveEvaluation(evaluation);

    const listed = repo.listOpportunities(ORG_B).find((row) => row.id === opportunity.id);
    assert.equal(listed?.latest?.version, 1);
    assert.equal(listed?.latest?.totalScore, evaluation.scores.total);
    assert.equal(listed?.latest?.decision, evaluation.recommendation.decision);
    assert.equal(listed?.activeRun, null);

    const rerun = newRun(opportunity.id, ORG_B, USER_B);
    const withRerun = repo.listOpportunities(ORG_B).find((row) => row.id === opportunity.id);
    assert.equal(withRerun?.activeRun?.id, rerun.id);
    // The saved version is still what the list reports while the rerun runs.
    assert.equal(withRerun?.latest?.version, 1);
  });

  test('an opportunity with no evaluation yet lists with a null latest', () => {
    const opportunity = newOpportunity(ORG_B, USER_B, 'Never evaluated');
    const listed = repo.listOpportunities(ORG_B).find((row) => row.id === opportunity.id);

    assert.equal(listed?.latest, null);
    assert.equal(listed?.name, 'Never evaluated');
  });
});

describe('rate limiting', () => {
  test('the allowance is spent exactly once per call, then refused', () => {
    const key = `test:${Date.now()}:${Math.random()}`;

    assert.equal(repo.consumeRateLimit(key, 3), true);
    assert.equal(repo.consumeRateLimit(key, 3), true);
    assert.equal(repo.consumeRateLimit(key, 3), true);
    assert.equal(repo.consumeRateLimit(key, 3), false);
  });

  test('buckets do not leak into one another', () => {
    const stamp = `${Date.now()}:${Math.random()}`;
    assert.equal(repo.consumeRateLimit(`a:${stamp}`, 1), true);
    assert.equal(repo.consumeRateLimit(`a:${stamp}`, 1), false);
    assert.equal(repo.consumeRateLimit(`b:${stamp}`, 1), true);
  });

  test('a zero allowance refuses everything', () => {
    assert.equal(repo.consumeRateLimit(`zero:${Math.random()}`, 0), false);
  });
});

describe('intake and audit', () => {
  test('optional intake fields survive the round trip for a rerun', () => {
    const opportunity = repo.createOpportunity({
      organizationId: ORG_A,
      createdBy: USER_A,
      name: 'With intake',
      description: DESCRIPTION,
      intake: {
        industry: 'Healthcare',
        geography: 'United States',
        competitors: ['Availity', 'Waystar'],
      },
    });

    const reloaded = repo.getOpportunity(ORG_A, opportunity.id);
    assert.equal(reloaded?.intake.industry, 'Healthcare');
    assert.deepEqual(reloaded?.intake.competitors, ['Availity', 'Waystar']);
  });

  test('audit entries are written without disturbing the caller', () => {
    const opportunity = newOpportunity(ORG_A, USER_A);
    assert.doesNotThrow(() =>
      repo.writeAudit({
        organizationId: ORG_A,
        actorId: USER_A,
        action: 'run.started',
        subjectType: 'opportunity',
        subjectId: opportunity.id,
        detail: 'provider=mock',
      }),
    );
  });
});
