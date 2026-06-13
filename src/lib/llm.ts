// Shared Anthropic client (direct Messages API — deployable, no subprocess).
// Tiers: strong for prose/angle/outline, fast for research/critique/extraction.
// A fresh call = a fresh context, which is how we get independent verifiers.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODELS = {
  strong: process.env.RK_MODEL_STRONG ?? "claude-fable-5",
  fast: process.env.RK_MODEL_FAST ?? "claude-sonnet-4-6",
} as const;

export interface LlmOptions {
  tier?: "strong" | "fast";
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function llmText(prompt: string, opts: LlmOptions = {}): Promise<string> {
  const res = await client.messages.create({
    model: MODELS[opts.tier ?? "fast"],
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Tolerant JSON extraction from model output (handles fences / surrounding prose). */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.search(/[[{]/);
    if (start === -1) throw new Error(`no JSON in model output: ${text.slice(0, 200)}`);
    const open = candidate[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let i = start; i < candidate.length; i++) {
      if (candidate[i] === open) depth++;
      else if (candidate[i] === close) depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
    }
    throw new Error(`unbalanced JSON in model output: ${text.slice(0, 200)}`);
  }
}

export async function llmJson<T>(prompt: string, opts: LlmOptions = {}): Promise<T> {
  const text = await llmText(prompt, { ...opts, system: (opts.system ?? "") + "\nRespond with JSON only." });
  return parseJsonLoose<T>(text);
}
