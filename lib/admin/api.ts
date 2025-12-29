const API_BASE = "/api/v1";

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export class AdminApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  
  const stored = sessionStorage.getItem("admin_api_key");
  if (stored) return stored;

  if (process.env.NODE_ENV !== "production") {
    const params = new URLSearchParams(window.location.search);
    const queryKey = params.get("apiKey");
    if (queryKey) {
      sessionStorage.setItem("admin_api_key", queryKey);
      return queryKey;
    }
  }

  return null;
}

export function setApiKey(key: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("admin_api_key", key);
  }
}

export function clearApiKey(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("admin_api_key");
  }
}

export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

export function maskKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new AdminApiError(
      "NO_API_KEY",
      "No API key configured. Please provide an API key.",
      401
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json: ApiResponse<T> = await response.json();

  if (!response.ok || !json.ok) {
    throw new AdminApiError(
      json.error?.code || "UNKNOWN_ERROR",
      json.error?.message || "An unknown error occurred",
      response.status,
      json.error?.details
    );
  }

  return json.data as T;
}

export const adminApi = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export interface TenantData {
  id: string;
  slug: string;
  name: string;
  status: string;
  webhookUrl: string | null;
  brandingJson: Record<string, unknown> | null;
  referralSettingsJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantStats {
  totalUsers: number;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
}

export interface RewardRule {
  id: string;
  ruleKey: string;
  enabled: boolean;
  conditionJson: Record<string, unknown> | null;
  rewardReferrerJson: Record<string, unknown> | null;
  rewardReferredJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyData {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyCreateResult {
  id: string;
  key: string;
  label: string;
  scopes: string[];
  createdAt: string;
}

export interface EventData {
  id: string;
  type: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}

export interface EventsListResult {
  events: EventData[];
  total: number;
  limit: number;
  offset: number;
}

export const tenantApi = {
  get: () => adminApi.get<{ tenant: TenantData }>("/tenant"),
  getStats: () => adminApi.get<{ stats: TenantStats }>("/tenant/stats"),
  updateBranding: (data: {
    brandingJson?: Record<string, unknown>;
    referralSettingsJson?: Record<string, unknown>;
  }) => adminApi.put<{ tenant: TenantData }>("/tenant/branding", data),
  updateWebhook: (data: { webhookUrl: string | null }) =>
    adminApi.put<{ tenant: TenantData }>("/tenant/webhook", data),
};

export const rulesApi = {
  list: () => adminApi.get<{ rules: RewardRule[] }>("/tenant/rules"),
  update: (ruleId: string, data: Partial<RewardRule>) =>
    adminApi.put<{ rule: RewardRule }>(`/tenant/rules/${ruleId}`, data),
};

export const apiKeysApi = {
  list: () => adminApi.get<{ apiKeys: ApiKeyData[] }>("/admin/api-keys"),
  create: (data: { label: string; scopes: string[] }) =>
    adminApi.post<ApiKeyCreateResult>("/admin/api-keys", data),
  revoke: (keyId: string) =>
    adminApi.post<{ success: boolean }>(`/admin/api-keys/${keyId}/revoke`, {}),
};

export const eventsApi = {
  list: (params?: { type?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return adminApi.get<EventsListResult>(`/admin/events${query ? `?${query}` : ""}`);
  },
};

export const webhooksApi = {
  test: () => adminApi.post<{ success: boolean; eventId: string }>("/webhooks/test", {}),
};
