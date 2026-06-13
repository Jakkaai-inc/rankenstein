// Crawl the site and draft brand guidelines. Grounding rule (refuse-and-flag):
// if the site cannot be read (password page, coming-soon, empty, unreachable),
// we DO NOT invent and DO NOT substitute another brand — we return a stub for
// manual entry. The human always confirms before anything generates.

import { llmJson } from "./llm";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankensteinBot/0.1)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (/name="password"|This store is password protected|Opening soon|password-page/i.test(html)) {
      return null; // password/coming-soon page -> treat as unreadable
    }
    return html;
  } catch {
    return null;
  }
}

export interface BrandDraft {
  error?: "site-unreachable";
  brandName?: string;
  industry?: string;
  audience?: string;
  voice?: string;
  brandFacts?: string;
  seedTopics?: string[];
  competitors?: string[];
}

export async function draftBrandFromSite(siteUrl: string): Promise<{
  ok: boolean;
  draft: BrandDraft;
  note: string;
}> {
  const base = siteUrl.replace(/\/$/, "");
  const home = await fetchText(base);
  if (!home) {
    return {
      ok: false,
      draft: { error: "site-unreachable" },
      note: "Site is not publicly readable (password page, coming-soon, or unreachable). Fill the brand profile in manually, then confirm.",
    };
  }
  const about =
    (await fetchText(`${base}/about`)) ??
    (await fetchText(`${base}/pages/about`)) ??
    (await fetchText(`${base}/pages/about-us`));

  const corpus = [stripHtml(home).slice(0, 6000), about ? stripHtml(about).slice(0, 4000) : ""]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const draft = await llmJson<BrandDraft>(
    `Below is text scraped from ${base} (homepage, and about page if found). Extract a brand profile.\n\n${corpus}\n\nReturn JSON:\n{"brandName": string, "industry": string (short, e.g. "fabric & sewing supplies"), "audience": string (who they sell to, 2-3 sentences), "voice": string (tone/personality as instructions for a writer, 3-5 sentences), "brandFacts": string (concrete citable facts ONLY from the text: location, founding, materials, certifications, processes; markdown bullets; never invent), "seedTopics": [string] (4-8 keyword-research starting topics grounded in what they actually sell), "competitors": [string]}\n\nHARD RULES: use ONLY the text above. If it is empty, a password page, or has no real brand content, return exactly {"error":"site-unreachable"}. NEVER substitute another brand. NEVER invent facts.`,
    {
      tier: "fast",
      system: "You are a precise brand strategist. You never invent facts and never substitute a different brand.",
      maxTokens: 2000,
    },
  );

  if (draft.error || !draft.brandName) {
    return {
      ok: false,
      draft: { error: "site-unreachable" },
      note: "Could not extract a brand from the site content. Fill the profile in manually, then confirm.",
    };
  }
  return { ok: true, draft, note: `Drafted from ${base}. Review and confirm.` };
}
