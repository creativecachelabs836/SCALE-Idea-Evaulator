import { z } from 'zod';
import { EvaluationPayloadSchema, type EvaluationPayload } from './scale-evaluation';

/**
 * The validation boundary (principles P1 and P3).
 *
 * Whatever produces an evaluation — a model, a fixture, an import — is
 * untrusted input. It is coerced into the canonical schema here, and anything
 * that cannot be repaired is rejected before it reaches a consumer.
 *
 * Repair is strictly structural. Nothing in this module invents analytical
 * content: it fixes shapes (a missing array, a stringified number, a wrapper
 * key), never scores, rationales, or sources. A producer that omits the
 * analysis fails, as it should.
 */

export class SchemaValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length > 0 ? `${message} (${issues.length} issue(s))` : message);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

export interface ValidationResult {
  payload: EvaluationPayload;
  /** True when anything had to be changed to make the payload conform. */
  repaired: boolean;
  /** What was changed, in order. Worth persisting as a quality signal. */
  notes: readonly string[];
}

/* ------------------------------------------------------------------ *
 * JSON extraction
 * ------------------------------------------------------------------ */

/**
 * Pull a JSON object out of text that may be wrapped in prose or a fenced code
 * block. Returns null when nothing parseable is present.
 */
export function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const parsed = tryParse(fence[1].trim());
    if (parsed !== undefined) return parsed;
  }

  // Fall back to the outermost brace span.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const parsed = tryParse(trimmed.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }

  return null;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------------ *
 * Structural repair — applied only when a first parse fails
 * ------------------------------------------------------------------ */

const OPTIONAL_ARRAY_KEYS = [
  'competitors',
  'claims',
  'hypotheses',
  'experiments',
  'sources',
] as const;

const MARKET_KEYS = ['dynamics', 'trends', 'risks', 'opportunities'] as const;

const ID_PREFIXES = [
  ['customerSegments', 'seg'],
  ['competitors', 'cmp'],
  ['valueChain', 'vc'],
  ['claims', 'clm'],
  ['hypotheses', 'hyp'],
  ['experiments', 'exp'],
  ['sources', 'src'],
] as const;

function repair(input: unknown, notes: string[]): unknown {
  if (!isRecord(input)) return input;

  let root = input;

  // Some producers wrap the payload in an envelope key.
  for (const key of ['output', 'result', 'data', 'evaluation', 'scaleEvaluation']) {
    const inner = root[key];
    if (isRecord(inner) && 'scores' in inner && 'opportunity' in inner) {
      notes.push(`Unwrapped the payload from a "${key}" envelope.`);
      root = inner;
      break;
    }
  }

  const out: Record<string, unknown> = { ...root };

  for (const key of OPTIONAL_ARRAY_KEYS) {
    if (out[key] == null) {
      out[key] = [];
      notes.push(`Defaulted the missing "${key}" to an empty array.`);
    } else if (!Array.isArray(out[key])) {
      out[key] = [out[key]];
      notes.push(`Wrapped a non-array "${key}" in an array.`);
    }
  }

  if (isRecord(out.market)) {
    const market: Record<string, unknown> = { ...out.market };
    for (const key of MARKET_KEYS) {
      if (market[key] == null) {
        market[key] = [];
        notes.push(`Defaulted the missing "market.${key}" to an empty array.`);
      }
    }
    out.market = market;
  }

  if (isRecord(out.scores)) {
    out.scores = repairScores(out.scores, notes);
  }

  // A non-numeric `order` fails validation outright, so coerce it here; the
  // contiguity pass in `normalizeValueChain` handles ordering itself.
  if (Array.isArray(out.valueChain)) {
    const nodes = out.valueChain.filter(isRecord);
    if (nodes.length === out.valueChain.length && nodes.some((n) => typeof n.order !== 'number')) {
      out.valueChain = nodes.map((node, index) => ({ ...node, order: index + 1 }));
      notes.push('Replaced non-numeric value-chain ordering.');
    }
  }

  for (const [key, prefix] of ID_PREFIXES) {
    const list = out[key];
    if (!Array.isArray(list)) continue;

    let synthesized = 0;
    out[key] = list.map((item, index) => {
      if (!isRecord(item)) return item;
      if (typeof item.id === 'string' && item.id.trim()) return item;
      synthesized += 1;
      return { ...item, id: `${prefix}-${index + 1}` };
    });
    if (synthesized > 0) {
      notes.push(`Synthesized ${synthesized} missing id(s) in "${key}".`);
    }
  }

  return out;
}

function repairScores(input: Record<string, unknown>, notes: string[]): Record<string, unknown> {
  const scores: Record<string, unknown> = { ...input };

  for (const [key, value] of Object.entries(scores)) {
    // `total` is not a dimension; it is handled by `noteDerivedFields`.
    if (key === 'total') continue;

    if (typeof value === 'number') {
      scores[key] = {
        score: value,
        rationale: 'No rationale supplied.',
        claimIds: [],
      };
      notes.push(`Expanded the bare numeric score "${key}" into a scored dimension.`);
      continue;
    }
    if (isRecord(value) && typeof value.score === 'string') {
      const parsed = Number(value.score);
      if (Number.isFinite(parsed)) {
        scores[key] = { ...value, score: Math.round(parsed) };
        notes.push(`Coerced the string score "${key}" to a number.`);
      }
    }
  }

  return scores;
}

/* ------------------------------------------------------------------ *
 * Normalization — applied to every payload, however it parsed
 * ------------------------------------------------------------------ */

/**
 * Force the value chain into a contiguous, correctly sorted 1-based order.
 *
 * This runs on every payload, not only on the repair path. Each node's `order`
 * is individually legal (1-20), so a producer returning all ones, or a gapped
 * sequence, passes schema validation while rendering a broken chain. Ordering
 * is a property of the set, so it is normalized rather than trusted (P3).
 *
 * The array is always sorted to match `order`, even when no renumbering was
 * needed, so every consumer can rely on array position.
 */
function normalizeValueChain(payload: EvaluationPayload, notes: string[]): EvaluationPayload {
  const sorted = [...payload.valueChain].sort((a, b) => a.order - b.order);
  const needsRenumbering = sorted.some((node, index) => node.order !== index + 1);

  if (needsRenumbering) {
    notes.push('Renumbered the value chain into a contiguous 1-based order.');
  }

  return {
    ...payload,
    valueChain: sorted.map((node, index) => ({ ...node, order: index + 1 })),
  };
}

/**
 * Drop cross-references pointing at ids that do not exist. A dangling source id
 * renders as a broken citation, which is worse than no citation at all (P3).
 */
function pruneDanglingReferences(
  payload: EvaluationPayload,
  notes: string[],
): EvaluationPayload {
  const sourceIds = new Set(payload.sources.map((source) => source.id));
  const claimIds = new Set(payload.claims.map((claim) => claim.id));
  const hypothesisIds = new Set(payload.hypotheses.map((hypothesis) => hypothesis.id));

  let dropped = 0;

  const keep = (ids: readonly string[], known: ReadonlySet<string>): string[] => {
    const kept = ids.filter((id) => known.has(id));
    dropped += ids.length - kept.length;
    return kept;
  };
  const keepSources = (ids: readonly string[]) => keep(ids, sourceIds);
  const keepClaims = (ids: readonly string[]) => keep(ids, claimIds);

  const withClaims = <T extends { claimIds: string[] }>(item: T): T => ({
    ...item,
    claimIds: keepClaims(item.claimIds),
  });

  const next: EvaluationPayload = {
    ...payload,
    claims: payload.claims.map((claim) => ({
      ...claim,
      sourceIds: keepSources(claim.sourceIds),
    })),
    customerSegments: payload.customerSegments.map(withClaims),
    competitors: payload.competitors.map(withClaims),
    market: {
      dynamics: payload.market.dynamics.map(withClaims),
      trends: payload.market.trends.map(withClaims),
      risks: payload.market.risks.map(withClaims),
      opportunities: payload.market.opportunities.map(withClaims),
    },
    hypotheses: payload.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      linkedClaimIds: keepClaims(hypothesis.linkedClaimIds),
    })),
    experiments: payload.experiments.map((experiment) => {
      if (experiment.hypothesisId && !hypothesisIds.has(experiment.hypothesisId)) {
        dropped += 1;
        const { hypothesisId: _dropped, ...rest } = experiment;
        return rest;
      }
      return experiment;
    }),
    scores: {
      marketAttractiveness: withClaims(payload.scores.marketAttractiveness),
      customerPain: withClaims(payload.scores.customerPain),
      edgeStrength: withClaims(payload.scores.edgeStrength),
      valueChainLeverage: withClaims(payload.scores.valueChainLeverage),
      defensibility: withClaims(payload.scores.defensibility),
      speedToMarket: withClaims(payload.scores.speedToMarket),
    },
  };

  if (dropped > 0) {
    notes.push(`Dropped ${dropped} reference(s) pointing at unknown ids.`);
  }
  return next;
}

/**
 * Reject duplicate ids within a collection. Unlike ordering, this cannot be
 * repaired without guessing which of two claims a citation meant, so it is an
 * error rather than a normalization.
 */
function assertUniqueIds(payload: EvaluationPayload): void {
  const collections: ReadonlyArray<readonly [string, ReadonlyArray<{ id: string }>]> = [
    ['customerSegments', payload.customerSegments],
    ['valueChain', payload.valueChain],
    ['competitors', payload.competitors],
    ['claims', payload.claims],
    ['hypotheses', payload.hypotheses],
    ['experiments', payload.experiments],
    ['sources', payload.sources],
  ];

  const issues: string[] = [];
  for (const [name, items] of collections) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) issues.push(`${name}: duplicate id "${item.id}"`);
      seen.add(item.id);
    }
  }

  if (issues.length > 0) {
    throw new SchemaValidationError('Evaluation contains duplicate ids.', issues);
  }
}

function finalize(payload: EvaluationPayload, notes: string[]): EvaluationPayload {
  assertUniqueIds(payload);
  return pruneDanglingReferences(normalizeValueChain(payload, notes), notes);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Record any derived field a producer supplied.
 *
 * `scores.total` and `recommendation.decision` are computed by `assemble.ts`
 * (P2), so a supplied one is always dropped — the schema does not declare them,
 * and unknown keys do not survive parsing. But that dropping is silent, and a
 * producer sending them is violating the contract in a way worth knowing about,
 * whether or not the rest of the payload happened to be well formed.
 *
 * So detection runs on every payload rather than only on the repair path. This
 * exists because a mutation test showed that removing the discard changed no
 * test outcome: the behaviour was correct but untested, which is indistinguishable
 * from accidental until someone edits it.
 */
function noteDerivedFields(candidate: unknown, notes: string[]): void {
  if (!isRecord(candidate)) return;

  const scores = candidate.scores;
  if (isRecord(scores) && 'total' in scores) {
    notes.push('Discarded a supplied scores.total; it is computed from the dimensions.');
  }

  const recommendation = candidate.recommendation;
  if (isRecord(recommendation) && 'decision' in recommendation) {
    notes.push('Discarded a supplied recommendation.decision; it is derived from the total.');
  }
}

/**
 * Validate an untrusted payload into a canonical one.
 *
 * @throws {SchemaValidationError} when the input cannot be repaired into a
 *   schema-valid payload.
 */
export function validateEvaluationPayload(raw: unknown): ValidationResult {
  const notes: string[] = [];
  const candidate = typeof raw === 'string' ? extractJson(raw) : raw;

  if (candidate == null) {
    throw new SchemaValidationError('Input contained no parseable JSON object.');
  }

  noteDerivedFields(candidate, notes);

  const first = EvaluationPayloadSchema.safeParse(candidate);
  if (first.success) {
    return {
      payload: finalize(first.data, notes),
      repaired: notes.length > 0,
      notes,
    };
  }

  const repaired = repair(candidate, notes);
  const second = EvaluationPayloadSchema.safeParse(repaired);
  if (second.success) {
    notes.unshift('Payload required structural repair before it validated.');
    return {
      payload: finalize(second.data, notes),
      repaired: true,
      notes,
    };
  }

  throw new SchemaValidationError(
    'Payload failed canonical schema validation.',
    formatIssues(second.error),
  );
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 40)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
}
