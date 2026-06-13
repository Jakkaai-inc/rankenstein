// Shared Anthropic client + structured-JSON helper for the live agent providers.
//
// Per Lane A's deployability note: call the Messages API directly (not the
// agent-sdk subprocess), and use a FRESH client per verifier so the verifier's
// context is independent of the writer's.

import Anthropic from '@anthropic-ai/sdk';

/** Model tiers. Defaults to the latest/most capable; env-overridable. */
export const MODELS = {
  strong: process.env.ANTHROPIC_MODEL_STRONG ?? 'claude-opus-4-8',
  fast: process.env.ANTHROPIC_MODEL_FAST ?? 'claude-haiku-4-5-20251001',
} as const;

export type Tier = keyof typeof MODELS;

/** A fresh client. Pass `independent: true` for verifiers to make the separate
 *  context explicit (still a new instance either way). */
export function makeClient(opts?: { apiKey?: string }): Anthropic {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Live providers need an API key (set env or pass apiKey).');
  }
  return new Anthropic({ apiKey });
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Strip ```json fences / prose and parse the first JSON object/array found. */
export function parseJsonLoose<T>(text: string): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // fall back to the first {...} or [...] span
  if (!/^[[{]/.test(t)) {
    const span = t.match(/[[{][\s\S]*[\]}]/);
    if (span) t = span[0];
  }
  return JSON.parse(t) as T;
}

export type StructuredCall = {
  client: Anthropic;
  tier: Tier;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

/** One Messages call that must return a JSON value. Retries once with a nudge
 *  if the first reply does not parse. */
export async function structuredCall<T>(args: StructuredCall): Promise<T> {
  const { client, tier, system, user } = args;
  const model = MODELS[tier];
  const max_tokens = args.maxTokens ?? 4096;
  const temperature = args.temperature ?? 0.4;

  const first = await client.messages.create({
    model,
    max_tokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const firstText = extractText(first);
  try {
    return parseJsonLoose<T>(firstText);
  } catch {
    const retry = await client.messages.create({
      model,
      max_tokens,
      temperature: 0,
      system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: firstText },
        { role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON value, no prose, no code fences.' },
      ],
    });
    return parseJsonLoose<T>(extractText(retry));
  }
}
