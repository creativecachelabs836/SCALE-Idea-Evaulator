/**
 * Word counting for the intake gate. Shared by the client (live counter) and
 * the server (authoritative validation), so the two can never disagree.
 *
 * Deliberately not imported from `config`, which is server-only.
 */

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export interface DescriptionCheck {
  ok: boolean;
  words: number;
  message?: string;
}

export function checkDescription(text: string, min: number, max: number): DescriptionCheck {
  const words = countWords(text);
  if (words < min) {
    return {
      ok: false,
      words,
      message: `Describe the idea in at least ${min} words. ${min - words} to go.`,
    };
  }
  if (words > max) {
    return {
      ok: false,
      words,
      message: `Keep the description under ${max} words. Remove about ${words - max}.`,
    };
  }
  return { ok: true, words };
}
