import type {
  Account,
  ApiError,
  ChangePasswordInput,
  CreateAccountInput,
  Dashboard,
  DryRunInput,
  DryRunResult,
  ErrorCode,
  HistoryItem,
  HistoryQuery,
  LoginInput,
  Paginated,
  RecoveryCodes,
  Rule,
  RuleInput,
  RulesSource,
  RunLog,
  RunQuery,
  Settings,
  SetupInput,
  Status,
  TotpSetup,
  UpdateAccountInput,
} from "@mewte/shared";

export type ClientErrorCode = ErrorCode | "network" | "unknown";

export class ApiRequestError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;

  constructor(code: ClientErrorCode, status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("network", 0, "Network request failed");
  }

  if (response.ok) return (await response.json()) as T;

  let payload: Partial<ApiError> = {};
  try {
    payload = (await response.json()) as Partial<ApiError>;
  } catch {
    // A proxy error page, for instance. Falls through to "unknown".
  }
  throw new ApiRequestError(
    payload.error?.code ?? "unknown",
    response.status,
    payload.error?.message ?? response.statusText,
  );
}

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface TotpStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

export const api = {
  status: () => request<Status>("GET", "/status"),
  setup: (input: SetupInput) => request<Status>("POST", "/setup", input),
  login: (input: LoginInput) => request<Status>("POST", "/auth/login", input),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  changePassword: (input: ChangePasswordInput) =>
    request<{ ok: true }>("POST", "/auth/password", input),

  totpStatus: () => request<TotpStatus>("GET", "/auth/totp"),
  totpSetup: () => request<TotpSetup>("POST", "/auth/totp/setup"),
  totpEnable: (code: string) => request<RecoveryCodes>("POST", "/auth/totp/enable", { code }),
  totpDisable: (password: string) =>
    request<{ ok: true }>("POST", "/auth/totp/disable", { password }),
  totpRecoveryCodes: (password: string) =>
    request<RecoveryCodes>("POST", "/auth/totp/recovery-codes", { password }),

  accounts: () => request<Account[]>("GET", "/accounts"),
  createAccount: (input: CreateAccountInput) => request<Account>("POST", "/accounts", input),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    request<Account>("PATCH", `/accounts/${id}`, input),
  deleteAccount: (id: string) => request<{ ok: true }>("DELETE", `/accounts/${id}`),
  runAccount: (id: string) => request<RunLog>("POST", `/accounts/${id}/run`),
  runBacklog: (id: string) => request<RunLog>("POST", `/accounts/${id}/backlog`),

  rules: () => request<Rule[]>("GET", "/rules"),
  rulesSource: () => request<RulesSource>("GET", "/rules/source"),
  rule: (id: string) => request<Rule>("GET", `/rules/${id}`),
  createRule: (input: RuleInput) => request<Rule>("POST", "/rules", input),
  updateRule: (id: string, input: RuleInput) => request<Rule>("PUT", `/rules/${id}`, input),
  deleteRule: (id: string) => request<{ ok: true }>("DELETE", `/rules/${id}`),
  dryRun: (input: DryRunInput) => request<DryRunResult>("POST", "/rules/dry-run", input),

  history: (params: HistoryQuery) =>
    request<Paginated<HistoryItem>>("GET", `/history${query(params)}`),
  runs: (params: RunQuery) => request<Paginated<RunLog>>("GET", `/runs${query(params)}`),

  settings: () => request<Settings>("GET", "/settings"),
  saveSettings: (input: Settings) => request<Settings>("PUT", "/settings", input),

  dashboard: (tzOffset: number) => request<Dashboard>("GET", `/dashboard${query({ tzOffset })}`),
};
