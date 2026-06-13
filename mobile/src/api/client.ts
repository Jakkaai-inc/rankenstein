// Typed client for the Rankenstein /api/v1 surface. Framework-agnostic: holds
// the bearer token in module state (hydrated from SecureStore at boot) and
// surfaces server errors as ApiError with the original status + message.

import { API_BASE } from "./config";
import type {
  Account,
  ConfirmBrandInput,
  LoginResponse,
  ProjectDetail,
  ProjectListItem,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | null = null;

/** Set (or clear) the in-memory bearer token used for authed requests. */
export function setToken(next: string | null): void {
  token = next;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean; // default true
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { auth = true, body, headers, ...rest } = opts;
  const h: Record<string, string> = {
    accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined) h["content-type"] = "application/json";
  if (auth && token) h["authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  login: (email: string, name?: string) =>
    request<LoginResponse>("/api/v1/auth/login", { method: "POST", auth: false, body: { email, name } }),

  logout: () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),

  me: () => request<{ account: Account }>("/api/v1/me"),

  listProjects: () => request<{ projects: ProjectListItem[] }>("/api/v1/projects"),

  createProject: (input: { name: string; siteUrl: string }) =>
    request<{ project: ProjectDetail }>("/api/v1/projects", { method: "POST", body: input }),

  getProject: (id: string) => request<{ project: ProjectDetail }>(`/api/v1/projects/${id}`),

  draftBrand: (id: string) =>
    request<{ brand: unknown }>(`/api/v1/projects/${id}/brand/draft`, { method: "POST" }),

  confirmBrand: (id: string, input: ConfirmBrandInput) =>
    request<{ brand: unknown }>(`/api/v1/projects/${id}/brand/confirm`, { method: "POST", body: input }),
};
