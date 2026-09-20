import { z } from 'zod';
import { AgentPayloadSchema, type AgentPayload } from '@/domain/scale-evaluation';

/**
 * The validation boundary (spec section 6 engineering rule + section 8).
 *
 * Model output is untrusted input. It is coerced into the canonical schema
 * here, and anything that cannot be repaired is rejected before it reaches the
 * database or the renderer.
 */

export class SchemaValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

export interface ValidationResult {
  payload: AgentPayload;
  /** True when structural repair was applied before validation succeeded. */
  repaired: boolean;
  /** Human-readable notes about what was repaired, persisted for QA. */
  repairNotes: string[];
}

/**
 * Pull a JSON object out of a model response that may be wrapped in prose or a
 * fenced code block. Returns null when nothing parseable is present.
 */
export function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  // ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const parsed = tryParse(fence[1].trim());
    if (parsed !== undefined) return parsed;
  }

  // Fall back to the outermost balanced brace span.
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

/**
 * Structural repairs that are safe to apply automatically. These fix shape
 * problems (a missing array, a stringified number, a stray wrapper key) without
 * inventing analytical content — nothing here fabricates a score, a rationale,
 * or a source.
 */
function repair(input: unknown, notes: string[]): unknown {
  if (!isRecord(input)) return input;

  let root: Record<string, unknown> = input;

  // Some workflows wrap the payload in an envelope key.
  for (const key of ['output', 'result', 'data', 'evaluation', 'scaleEvaluation']) {
    const inner = root[key];
    if (isRecord(inner) && 'scores' in inner && 'opportunity' in inner) {
      notes.push(`Unwrapped payload from "${key}" envelope.`);
      root = inner;
      break;
    }
  }

  const out: Record<string, unknown> = { ...root };

  // Arrays that the schema requires but a model may omit when empty.
  for (const key of ['competitors', 'claims', 'hypotheses', 'experiments', 'sources']) {
    if (out[key] == null) {
      out[key] = [];
      notes.push(`Defaulted missing "${key}" to an empty array.`);
    } else if (!Array.isArray(out[key])) {
      out[key] = [out[key]];
      notes.push(`Wrapped scalar "${key}" in an array.`);
    }
  }

  if (isRecord(out.market)) {
    const market: Record<string, unknown> = { ...out.market };
    for (const key of ['dynamics', 'trends', 'risks', 'opportunities']) {
      if (market[key] == null) {
        market[key] = [];
        notes.push(`Defaulted missing "market.${key}" to an empty array.`);
      }
    }
    out.market = market;
  }

  // Scores arriving as strings ("4") or as a bare number instead of an object.
  if (isRecord(out.scores)) {
    const scores: Record<string, unknown> = { ...out.scores };
    // `total` is computed server-side; drop whatever the model claimed.
    if ('total' in scores) {
      delete scores.total;
      notes.push('Discarded model-supplied scores.total; recomputed server-side.');
    }
    for (const [key, value] of Object.entries(scores)) {
      if (typeof value === 'number') {
        scores[key] = { score: value, rationale: 'No rationale supplied.', claimIds: [] };
        notes.push(`Expanded bare numeric score "${key}" into a scored dimension.`);
      } else if (isRecord(value) && typeof value.score === 'string') {
        const n = Number(value.score);
        if (Number.isFinite(n)) {
          scores[key] = { ...value, score: Math.round(n) };
          notes.push(`Coerced string score "${key}" to a number.`);
        }
      }
    }
    out.scores = scores;
  }

  // `decision` is derived from the total, never taken from the model.
  if (isRecord(out.recommendation) && 'decision' in out.recommendation) {
    const rec: Record<string, unknown> = { ...out.recommendation };
    delete rec.decision;
    out.recommendation = rec;
    notes.push('Discarded model-supplied recommendation.decision; derived server-side.');
  }

  // A non-numeric `order` fails validation outright, so coerce it here; the
  // contiguity pass in `normalizeValueChainOrder` handles the rest.
  if (Array.isArray(out.valueChain)) {
    const nodes = out.valueChain.filter(isRecord);
    if (nodes.some((n) => typeof n.order !== 'number')) {
      out.valueChain = nodes.map((n, i) => ({ ...n, order: i + 1 }));
      notes.push('Replaced non-numeric value-chain ordering.');
    }
  }

  // Ids are referenced across sections; synthesize stable ones where missing.
  for (const [key, prefix] of [
    ['customerSegments', 'seg'],
    ['competitors', 'cmp'],
    ['valueChain', 'vc'],
    ['claims', 'clm'],
    ['hypotheses', 'hyp'],
    ['experiments', 'exp'],
    ['sources', 'src'],
  ] as const) {
    if (!Array.isArray(out[key])) continue;
    let synthesized = 0;
    out[key] = (out[key] as unknown[]).map((item, i) => {
      if (!isRecord(item)) return item;
      if (typeof item.id === 'string' && item.id.trim()) return item;
      synthesized += 1;
      return { ...item, id: `${prefix}-${i + 1}` };
    });
    if (synthesized > 0) {
      notes.push(`Synthesized ${synthesized} missing id(s) in "${key}".`);
    }
  }

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Force the value chain into a contiguous, correctly sorted 1-based order.
 *
 * This runs on every payload, not only on the repair path: each node's `order`
 * is individually legal (1-20), so a model that returns all-ones or a gap
 * passes schema validation while rendering a broken chain visual. Ordering is
 * structural, so it is normalized rather than trusted.
 */
function normalizeValueChainOrder(payload: AgentPayload, notes: string[]): AgentPayload {
  const sorted = [...payload.valueChain].sort((a, b) => a.order - b.order);
  const renumbered = sorted.some((node, i) => node.order !== i + 1);

  if (renumbered) {
    notes.push('Renumbered value-chain nodes into a contiguous 1-based order.');
  }

  // The array is always sorted to match `order`, even when no renumbering was
  // needed, so every consumer can rely on array position and none has to
  // remember to sort.
  return {
    ...payload,
    valueChain: sorted.map((node, i) => ({ ...node, order: i + 1 })),
  };
}

/**
 * Drop cross-references that point at ids which do not exist. A dangling
 * sourceId renders as a broken citation, which is worse than no citation.
 */
function pruneDanglingReferences(payload: AgentPayload, notes: string[]): AgentPayload {
  const sourceIds = new Set(payload.sources.map((s) => s.id));
  const claimIds = new Set(payload.claims.map((c) => c.id));
  const hypothesisIds = new Set(payload.hypotheses.map((h) => h.id));
  let dropped = 0;

  const keepSources = (ids: string[]) => {
    const kept = ids.filter((id) => sourceIds.has(id));
    dropped += ids.length - kept.length;
    return kept;
  };
  const keepClaims = (ids: string[]) => {
    const kept = ids.filter((id) => claimIds.has(id));
    dropped += ids.length - kept.length;
    return kept;
  };

  const next: AgentPayload = {
    ...payload,
    claims: payload.claims.map((c) => ({ ...c, sourceIds: keepSources(c.sourceIds) })),
    customerSegments: payload.customerSegments.map((s) => ({
      ...s,
      claimIds: keepClaims(s.claimIds),
    })),
    competitors: payload.competitors.map((c) => ({ ...c, claimIds: keepClaims(c.claimIds) })),
    hypotheses: payload.hypotheses.map((h) => ({
      ...h,
      linkedClaimIds: keepClaims(h.linkedClaimIds),
    })),
    experiments: payload.experiments.map((e) => ({
      ...e,
      hypothesisId:
        e.hypothesisId && hypothesisIds.has(e.hypothesisId) ? e.hypothesisId : undefined,
    })),
    market: {
      dynamics: payload.market.dynamics.map((m) => ({ ...m, claimIds: keepClaims(m.claimIds) })),
      trends: payload.market.trends.map((m) => ({ ...m, claimIds: keepClaims(m.claimIds) })),
      risks: payload.market.risks.map((m) => ({ ...m, claimIds: keepClaims(m.claimIds) })),
      opportunities: payload.market.opportunities.map((m) => ({
        ...m,
        claimIds: keepClaims(m.claimIds),
      })),
    },
    scores: Object.fromEntries(
      Object.entries(payload.scores).map(([k, v]) => [k, { ...v, claimIds: keepClaims(v.claimIds) }]),
    ) as AgentPayload['scores'],
  };

  if (dropped > 0) {
    notes.push(`Dropped ${dropped} reference(s) pointing at unknown ids.`);
  }
  return next;
}

/**
 * Validate a raw agent response into a canonical payload.
 *
 * @throws SchemaValidationError when the response cannot be repaired into a
 *         schema-valid payload.
 */
export function validateAgentPayload(raw: unknown): ValidationResult {
  const notes: string[] = [];
  const candidate = typeof raw === 'string' ? extractJson(raw) : raw;

  if (candidate == null) {
    throw new SchemaValidationError('Agent response contained no parseable JSON object.', []);
  }

  const first = AgentPayloadSchema.safeParse(candidate);
  if (first.success) {
    const normalized = normalizeValueChainOrder(first.data, notes);
    return {
      payload: pruneDanglingReferences(normalized, notes),
      repaired: notes.length > 0,
      repairNotes: notes,
    };
  }

  const repaired = repair(candidate, notes);
  const second = AgentPayloadSchema.safeParse(repaired);
  if (second.success) {
    notes.unshift('Payload required structural repair before it validated.');
    const normalized = normalizeValueChainOrder(second.data, notes);
    return {
      payload: pruneDanglingReferences(normalized, notes),
      repaired: true,
      repairNotes: notes,
    };
  }

  throw new SchemaValidationError(
    'Agent response failed canonical schema validation.',
    formatIssues(second.error),
  );
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 40).map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
}
