// Wire types — mirror src/lib/api/serializers.ts on the server. Keep in sync.

export interface Account {
  id: string;
  email: string;
  name: string | null;
  kind: string; // "site_owner" | "agency"
  credits: number;
  createdAt: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  siteUrl: string;
  shopifyConnected: boolean;
  brandConfirmed: boolean;
  pieces: number;
  createdAt: string;
}

export interface BrandPublic {
  brandName: string;
  industry: string | null;
  audience: string | null;
  voice: string | null;
  brandFacts: string | null;
  seedTopics: string[];
  competitors: string[];
  confirmed: boolean;
  confirmedAt: string | null;
}

export type RunStatus = "QUEUED" | "RUNNING" | "PAUSED" | "SUCCEEDED" | "FAILED";

export interface RunSummary {
  id: string;
  status: RunStatus;
  total: number;
  done: number;
  flagged: number;
  spendUsd: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  siteUrl: string;
  shopify: { shopDomain: string; installedAt: string } | null;
  brand: BrandPublic | null;
  counts: { pieces: number; pages: number };
  gate: { shopifyConnected: boolean; brandConfirmed: boolean };
  runs: RunSummary[];
  createdAt: string;
}

// POST /api/v1/projects/:id/run — one server-side batch. Call again to advance.
export interface RunResult {
  runId: string;
  done: number;
  flagged: number;
  stopped: boolean; // true when the spend soft-stop paused the run
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  account: Account;
}

export interface ConfirmBrandInput {
  brandName?: string;
  industry?: string;
  audience?: string;
  voice?: string;
  brandFacts?: string;
  seedTopics: string[];
  competitors?: string[];
}
