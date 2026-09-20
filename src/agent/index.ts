import { config } from '@/lib/config';
import { mockProvider } from './mock-provider';
import { openaiAgentProvider, openaiResponsesProvider } from './openai-provider';
import type { EvaluationProvider } from './types';

/**
 * Provider selection. The only place in the codebase that knows which model
 * backend is in use; everything downstream sees an `EvaluationProvider`.
 */
export function getProvider(): EvaluationProvider {
  switch (config.provider) {
    case 'openai-agent':
      return openaiAgentProvider;
    case 'openai-responses':
      return openaiResponsesProvider;
    case 'mock':
    default:
      return mockProvider;
  }
}

export * from './types';
