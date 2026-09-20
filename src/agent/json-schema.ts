import { z } from 'zod';
import { AgentPayloadSchema } from '@/domain/scale-evaluation';

/**
 * Convert the canonical zod schema into a JSON Schema that satisfies OpenAI's
 * strict structured-output rules:
 *   - every object sets additionalProperties: false
 *   - every property is listed in `required`
 *   - optionality is expressed as a nullable union, not by omission
 *   - validation-only keywords that strict mode rejects are stripped
 *
 * Deriving this from the zod schema rather than hand-maintaining a second copy
 * means the agent contract and the validation boundary cannot drift apart.
 */

type JsonSchema = Record<string, unknown>;

const UNSUPPORTED_KEYWORDS = [
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
  '$schema',
] as const;

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (typeof node !== 'object' || node === null) return node;

  const input = node as JsonSchema;
  const out: JsonSchema = {};

  for (const [key, value] of Object.entries(input)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;
    out[key] = strictify(value);
  }

  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    const props = out.properties as JsonSchema;
    const declaredRequired = new Set(
      Array.isArray(input.required) ? (input.required as string[]) : [],
    );

    for (const propName of Object.keys(props)) {
      // A property the model may legitimately omit becomes explicitly nullable,
      // because strict mode requires every key to be present in the output.
      if (!declaredRequired.has(propName)) {
        props[propName] = makeNullable(props[propName] as JsonSchema);
      }
    }

    out.required = Object.keys(props);
    out.additionalProperties = false;
  }

  return out;
}

function makeNullable(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema.type)) {
    return schema.type.includes('null') ? schema : { ...schema, type: [...schema.type, 'null'] };
  }
  if (typeof schema.type === 'string') {
    return { ...schema, type: [schema.type, 'null'] };
  }
  // Unions, enums and $refs: wrap instead of mutating.
  if (schema.anyOf || schema.oneOf || schema.$ref || schema.enum) {
    return { anyOf: [schema, { type: 'null' }] };
  }
  return schema;
}

let cached: JsonSchema | null = null;

/** The strict JSON Schema for the agent contract. Computed once per process. */
export function agentPayloadJsonSchema(): JsonSchema {
  if (cached) return cached;
  const raw = z.toJSONSchema(AgentPayloadSchema, {
    target: 'draft-2020-12',
    io: 'input',
    // Inline every definition; strict mode does not accept external refs.
    reused: 'inline',
  }) as JsonSchema;
  cached = strictify(raw) as JsonSchema;
  return cached;
}
