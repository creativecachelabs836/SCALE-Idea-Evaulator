import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ITERATIONS, CURRENT_ITERATION } from '@/lib/iterations.ts';

/**
 * Iteration 0 acceptance.
 *
 * These prove the harness itself works — that a test can import application
 * source through the `@/*` alias and that assertions run. They also keep the
 * roadmap shown in the running app honest against SPEC.md, so the two cannot
 * drift apart silently.
 */

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('test harness', () => {
  test('resolves the @/* path alias into application source', () => {
    assert.ok(Array.isArray(ITERATIONS));
    assert.ok(ITERATIONS.length > 0);
  });

  test('strips TypeScript types without a build step', () => {
    const iteration: (typeof ITERATIONS)[number] | undefined = ITERATIONS[0];
    assert.equal(iteration?.number, 0);
  });
});

describe('roadmap', () => {
  test('iterations are numbered contiguously from zero', () => {
    assert.deepEqual(
      ITERATIONS.map((i) => i.number),
      ITERATIONS.map((_, index) => index),
    );
  });

  test('every iteration has a title and a goal', () => {
    for (const iteration of ITERATIONS) {
      assert.ok(iteration.title.trim().length > 0, `iteration ${iteration.number} title`);
      assert.ok(iteration.goal.trim().length > 0, `iteration ${iteration.number} goal`);
    }
  });

  test('the current iteration exists on the roadmap', () => {
    assert.ok(
      ITERATIONS.some((i) => i.number === CURRENT_ITERATION),
      `CURRENT_ITERATION ${CURRENT_ITERATION} is not in the roadmap`,
    );
  });

  /**
   * The landing page mirrors the spec. If someone adds an iteration to one and
   * forgets the other, the running app starts lying about the plan.
   */
  test('every iteration in the code appears in SPEC.md', () => {
    const spec = fs.readFileSync(path.join(repoRoot, 'SPEC.md'), 'utf8');
    const missing = ITERATIONS.filter(
      (i) => !spec.includes(`### Iteration ${i.number} — ${i.title}`),
    );
    assert.deepEqual(
      missing.map((i) => `${i.number}: ${i.title}`),
      [],
      'iterations present in src/lib/iterations.ts but not in SPEC.md',
    );
  });

  test('SPEC.md introduces no iteration the code does not know about', () => {
    const spec = fs.readFileSync(path.join(repoRoot, 'SPEC.md'), 'utf8');
    const numbersInSpec = [...spec.matchAll(/^### Iteration (\d+) — /gm)].map((m) =>
      Number(m[1]),
    );
    assert.deepEqual(
      numbersInSpec,
      ITERATIONS.map((i) => i.number),
    );
  });
});
