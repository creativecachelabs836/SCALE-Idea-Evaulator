/**
 * Server-side configuration. Nothing here is exposed to the browser: no module
 * under `src/lib/config` may be imported from a client component, which is what
 * keeps model credentials off the client (spec section 9, Security).
 */

import 'server-only';

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type ProviderName = 'mock' | 'openai-agent' | 'openai-responses';

function providerName(): ProviderName {
  const raw = process.env.SCALE_PROVIDER?.trim();
  if (raw === 'openai-agent' || raw === 'openai-responses' || raw === 'mock') return raw;
  // Default to the provider that needs no credentials, so a fresh checkout runs.
  return 'mock';
}

export const config = {
  provider: providerName(),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  workflowId:
    process.env.SCALE_WORKFLOW_ID?.trim() ||
    'wf_69db31a9f2dc8190986dec2bb55300650d19df1574b9f7ee',
  model: process.env.SCALE_MODEL?.trim() || 'gpt-5',
  dbPath: process.env.SCALE_DB_PATH?.trim() || './data/scale.db',
  minDescriptionWords: num(process.env.SCALE_MIN_DESCRIPTION_WORDS, 75),
  maxDescriptionWords: num(process.env.SCALE_MAX_DESCRIPTION_WORDS, 500),
  chromiumPath: process.env.SCALE_CHROMIUM_PATH?.trim() || '',
  rateLimitPerHour: num(process.env.SCALE_RATE_LIMIT_PER_HOUR, 10),
  /** Spec section 9: agent evaluation should target completion in <5 minutes. */
  providerTimeoutMs: num(process.env.SCALE_PROVIDER_TIMEOUT_MS, 300_000),
  maxRetries: num(process.env.SCALE_MAX_RETRIES, 2),
  baseUrl: process.env.SCALE_BASE_URL?.trim() || 'http://127.0.0.1:3000',
} as const;
