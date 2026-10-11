import { z } from "zod";
import {
  DEFAULT_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
  MAX_RETENTION_DAYS,
  MIN_INTERVAL_SEC,
} from "./constants";
import { conditionSchema } from "./rules/schema";

// ---------- errors ----------

export const ERROR_CODES = [
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "internal_error",
  "not_initialized",
  "already_initialized",
  "setup_token_invalid",
  "invalid_credentials",
  "totp_required",
  "totp_invalid",
  "totp_not_pending",
  "totp_already_enabled",
  "wrong_password",
  "github_token_invalid",
  "github_token_missing_scope",
  "github_unreachable",
  "account_exists",
  "account_mismatch",
  "account_busy",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const okSchema = z.object({ ok: z.literal(true) });

// ---------- auth ----------

export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/, "Only letters, digits, underscore, dot and dash are allowed");
export const passwordSchema = z.string().min(8).max(256);

export const setupInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  setupToken: z.string().max(512).optional(),
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
  /** A TOTP code or a one-time recovery code. Required once TOTP is enabled. */
  code: z.string().trim().max(64).optional(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const statusSchema = z.object({
  initialized: z.boolean(),
  setupTokenRequired: z.boolean(),
  user: z
    .object({
      username: z.string(),
      totpEnabled: z.boolean(),
    })
    .nullable(),
});
export type Status = z.infer<typeof statusSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const totpSetupSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});
export type TotpSetup = z.infer<typeof totpSetupSchema>;

export const totpEnableInputSchema = z.object({ code: z.string().trim().min(6).max(8) });
export const recoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;
export const passwordConfirmInputSchema = z.object({ password: z.string().min(1).max(256) });

// ---------- GitHub accounts ----------

export const intervalSecSchema = z.number().int().min(MIN_INTERVAL_SEC).max(MAX_INTERVAL_SEC);

export const ACCOUNT_STATUSES = ["ok", "unauthorized", "error"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accountSchema = z.object({
  id: z.string(),
  login: z.string(),
  avatarUrl: z.string(),
  scopes: z.array(z.string()),
  intervalSec: z.number().int(),
  enabled: z.boolean(),
  status: z.enum(ACCOUNT_STATUSES),
  lastError: z.string().nullable(),
  lastRunAt: z.number().nullable(),
  nextRunAt: z.number().nullable(),
  running: z.boolean(),
  createdAt: z.number(),
});
export type Account = z.infer<typeof accountSchema>;

const tokenSchema = z.string().trim().min(20).max(512);

export const createAccountInputSchema = z.object({
  token: tokenSchema,
  intervalSec: intervalSecSchema.default(DEFAULT_INTERVAL_SEC),
});
export type CreateAccountInput = z.input<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.object({
  token: tokenSchema.optional(),
  intervalSec: intervalSecSchema.optional(),
  enabled: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

// ---------- rules ----------

export const accountScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("accounts"), accountIds: z.array(z.string()).min(1).max(100) }),
]);
export type AccountScope = z.infer<typeof accountScopeSchema>;

export const RULE_ACTIONS = ["mark_done"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100_000),
  accountScope: accountScopeSchema,
  condition: conditionSchema,
  action: z.enum(RULE_ACTIONS),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const ruleSchema = ruleInputSchema.extend({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const notificationPreviewSchema = z.object({
  threadId: z.string(),
  title: z.string(),
  repo: z.string(),
  subjectType: z.string(),
  reason: z.string(),
  url: z.string(),
  updatedAt: z.string(),
});
export type NotificationPreview = z.infer<typeof notificationPreviewSchema>;

export const dryRunInputSchema = z.object({
  accountScope: accountScopeSchema,
  condition: conditionSchema,
});
export type DryRunInput = z.infer<typeof dryRunInputSchema>;

export const dryRunResultSchema = z.object({
  accounts: z.array(
    z.object({
      accountId: z.string(),
      login: z.string(),
      fetched: z.number().int(),
      error: z.string().nullable(),
      matches: z.array(notificationPreviewSchema),
    }),
  ),
});
export type DryRunResult = z.infer<typeof dryRunResultSchema>;

// ---------- pagination ----------

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- history ----------

export const historyItemSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountLogin: z.string(),
  threadId: z.string(),
  title: z.string(),
  repo: z.string(),
  subjectType: z.string(),
  reason: z.string(),
  url: z.string(),
  ruleId: z.string().nullable(),
  ruleName: z.string(),
  processedAt: z.number(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyQuerySchema = z.object({
  ...pageQuery,
  accountId: z.string().optional(),
  ruleId: z.string().optional(),
  repo: z.string().max(255).optional(),
  subjectType: z.string().max(64).optional(),
  reason: z.string().max(64).optional(),
  q: z.string().max(200).optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});
export type HistoryQuery = z.input<typeof historyQuerySchema>;

export const historyPageSchema = paginated(historyItemSchema);

// ---------- run logs ----------

export const RUN_TRIGGERS = ["schedule", "manual"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];
export const RUN_STATUSES = ["success", "partial", "error"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const runLogSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountLogin: z.string(),
  trigger: z.enum(RUN_TRIGGERS),
  status: z.enum(RUN_STATUSES),
  fetched: z.number().int(),
  matched: z.number().int(),
  processed: z.number().int(),
  errors: z.array(z.string()),
  startedAt: z.number(),
  finishedAt: z.number(),
});
export type RunLog = z.infer<typeof runLogSchema>;

export const runQuerySchema = z.object({
  ...pageQuery,
  accountId: z.string().optional(),
  status: z.enum(RUN_STATUSES).optional(),
});
export type RunQuery = z.input<typeof runQuerySchema>;

export const runPageSchema = paginated(runLogSchema);

// ---------- settings ----------

export const settingsSchema = z.object({
  /** Days to keep history and run logs. 0 keeps them forever. */
  retentionDays: z.number().int().min(0).max(MAX_RETENTION_DAYS),
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------- dashboard ----------

export const dashboardQuerySchema = z.object({
  /** Minutes to add to UTC to get the viewer's local time, e.g. 480 for UTC+8. */
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

export const dashboardSchema = z.object({
  accounts: z.object({
    total: z.number().int(),
    enabled: z.number().int(),
    unhealthy: z.number().int(),
  }),
  rules: z.object({ total: z.number().int(), enabled: z.number().int() }),
  processed: z.object({
    last24h: z.number().int(),
    last7d: z.number().int(),
    total: z.number().int(),
  }),
  daily: z.array(z.object({ date: z.string(), count: z.number().int() })),
  recentRuns: z.array(runLogSchema),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
