import OpenAI from 'openai';
import { agentPayloadJsonSchema } from './json-schema';
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION } from './prompt';
import { SchemaValidationError, validateAgentPayload } from './validate';
import {
  PermanentProviderError,
  TransientProviderError,
  type EvaluationProvider,
  type EvaluationRequest,
  type EvaluationResponse,
  type ProgressReporter,
} from './types';
import { config } from '@/lib/config';

/**
 * OpenAI-backed evaluation providers (spec section 8).
 *
 * Two invocation paths are supported because section 13 leaves "the exact
 * Agent Builder invocation interface" as an open architecture decision:
 *
 *   `openai-responses` - the Responses API with a strict JSON schema and the
 *       hosted web-search tool. Fully self-contained; this is the path that
 *       runs today.
 *   `openai-agent` - delegates to the published Agent Builder workflow. The
 *       request/response shape is isolated in `invokeWorkflow` so that
 *       confirming the interface is a one-function change.
 *
 * Neither path is ever reachable from the browser: API keys are read from the
 * server environment only.
 */

function client(): OpenAI {
  if (!config.openaiApiKey) {
    throw new PermanentProviderError(
      'OPENAI_API_KEY is not configured. Set it in the server environment or run with SCALE_PROVIDER=mock.',
    );
  }
  return new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 0 });
}

/** Map an SDK error onto our retryable / non-retryable split. */
function classify(error: unknown): never {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403) {
    throw new PermanentProviderError(`OpenAI rejected the credentials: ${message}`);
  }
  if (status === 400 || status === 404 || status === 422) {
    throw new PermanentProviderError(`OpenAI rejected the request: ${message}`);
  }
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    throw new TransientProviderError(`OpenAI upstream failure (${status}): ${message}`, error);
  }
  // Network-level failures and aborts are worth another attempt.
  throw new TransientProviderError(`OpenAI request failed: ${message}`, error);
}

const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5': { input: 1.25, output: 10 },
};

function estimateCost(model: string, inputTokens = 0, outputTokens = 0): number | undefined {
  const base = model.split(/[-:]/).slice(0, 2).join('-');
  const price = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK[base];
  if (!price) return undefined;
  return (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
}

/**
 * Advance the reported stage on a timer while the upstream call is in flight.
 *
 * The Responses API does not stream per-phase milestones for a single call, so
 * the UI would otherwise sit on "Understanding idea" for minutes. The schedule
 * is presentational; the authoritative status transitions are written by the
 * orchestrator.
 */
function driveProgress(onProgress: ProgressReporter, stageCount: number, intervalMs: number) {
  let stage = 0;
  const timer = setInterval(() => {
    stage = Math.min(stage + 1, stageCount - 1);
    onProgress(stage);
    if (stage === stageCount - 1) clearInterval(timer);
  }, intervalMs);
  return () => clearInterval(timer);
}

async function runResponses(
  request: EvaluationRequest,
  onProgress: ProgressReporter,
): Promise<EvaluationResponse> {
  const openai = client();
  const model = config.model;
  const stop = driveProgress(onProgress, 8, 18_000);

  try {
    const response = await openai.responses.create(
      {
        model,
        instructions: SYSTEM_PROMPT,
        input: buildUserPrompt(request),
        tools: [{ type: 'web_search' }],
        text: {
          format: {
            type: 'json_schema',
            name: 'scale_evaluation',
            strict: true,
            schema: agentPayloadJsonSchema(),
          },
        },
      },
      { signal: request.signal, timeout: config.providerTimeoutMs },
    );

    const text = response.output_text;
    if (!text) {
      throw new TransientProviderError('OpenAI returned an empty response body.');
    }

    const result = validateAgentPayload(text);
    const inputTokens = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;
    const toolCallCount = Array.isArray(response.output)
      ? response.output.filter((i) => i.type !== 'message').length
      : 0;

    return {
      payload: result.payload,
      usage: {
        inputTokens,
        outputTokens,
        toolCallCount,
        estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      },
      modelVersion: response.model ?? model,
      workflowVersion: `responses:${PROMPT_VERSION}`,
      repaired: result.repaired,
      repairNotes: result.repairNotes,
    };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw new PermanentProviderError(error.message, error.issues);
    }
    if (error instanceof PermanentProviderError || error instanceof TransientProviderError) {
      throw error;
    }
    classify(error);
  } finally {
    stop();
  }
}

/**
 * Invoke the published Agent Builder workflow.
 *
 * Isolated so the exact wire format stays one replaceable function. The
 * workflow is expected to return the canonical payload; whatever envelope it
 * arrives in is unwrapped by the shared validation layer.
 */
async function invokeWorkflow(
  openai: OpenAI,
  request: EvaluationRequest,
): Promise<{ raw: unknown; model?: string; usage?: Record<string, number> }> {
  const body = {
    workflow: { id: config.workflowId },
    input: {
      description: request.description,
      name: request.name,
      industry: request.industry,
      target_customer: request.targetCustomer,
      geography: request.geography,
      business_model: request.businessModel,
      competitors: request.competitors ?? [],
      attachments: request.attachments ?? [],
      schema_version: PROMPT_VERSION,
    },
  };

  const result = (await openai.post('/workflows/runs', {
    body,
    signal: request.signal,
    timeout: config.providerTimeoutMs,
  })) as Record<string, unknown>;

  return {
    raw: result.output ?? result.result ?? result,
    model: typeof result.model === 'string' ? result.model : undefined,
    usage: (result.usage as Record<string, number> | undefined) ?? undefined,
  };
}

async function runAgentBuilder(
  request: EvaluationRequest,
  onProgress: ProgressReporter,
): Promise<EvaluationResponse> {
  const openai = client();
  const stop = driveProgress(onProgress, 8, 18_000);

  try {
    const { raw, model, usage } = await invokeWorkflow(openai, request);
    const result = validateAgentPayload(raw);

    return {
      payload: result.payload,
      usage: {
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        toolCallCount: usage?.tool_calls,
        estimatedCostUsd: estimateCost(
          model ?? config.model,
          usage?.input_tokens,
          usage?.output_tokens,
        ),
      },
      modelVersion: model ?? 'agent-builder',
      workflowVersion: config.workflowId,
      repaired: result.repaired,
      repairNotes: result.repairNotes,
    };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw new PermanentProviderError(error.message, error.issues);
    }
    if (error instanceof PermanentProviderError || error instanceof TransientProviderError) {
      throw error;
    }
    classify(error);
  } finally {
    stop();
  }
}

export const openaiResponsesProvider: EvaluationProvider = {
  name: 'openai-responses',
  evaluate: runResponses,
};

export const openaiAgentProvider: EvaluationProvider = {
  name: 'openai-agent',
  evaluate: runAgentBuilder,
};
