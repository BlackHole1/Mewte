export const LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko", "ru", "fr", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Reasons documented by GitHub. The API may return values outside this list. */
export const KNOWN_REASONS = [
  "agent_session_finished",
  "approval_requested",
  "assign",
  "author",
  "ci_activity",
  "comment",
  "invitation",
  "manual",
  "member_feature_requested",
  "mention",
  "review_requested",
  "security_advisory_credit",
  "security_alert",
  "state_change",
  "subscribed",
  "team_mention",
] as const;

/** Subject types seen in the wild. The API may return values outside this list. */
export const KNOWN_SUBJECT_TYPES = [
  "Issue",
  "PullRequest",
  "Discussion",
  "Commit",
  "Release",
  "CheckSuite",
  "WorkflowRun",
  "RepositoryInvitation",
  "RepositoryVulnerabilityAlert",
  "RepositoryDependabotAlertsThread",
  "RepositoryAdvisory",
] as const;

/** `merged` and `draft` only occur on pull requests, `answered` only on discussions. */
export const SUBJECT_STATES = ["open", "closed", "merged", "draft", "answered"] as const;
export type SubjectState = (typeof SUBJECT_STATES)[number];

export const MIN_INTERVAL_SEC = 60;
export const MAX_INTERVAL_SEC = 24 * 60 * 60;
export const DEFAULT_INTERVAL_SEC = 300;

export const DEFAULT_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;

export const MAX_CONDITION_DEPTH = 6;
