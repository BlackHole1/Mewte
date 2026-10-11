import type { Account, RunStatus } from "@mewte/shared";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RUN_VARIANTS = { success: "success", partial: "warning", error: "error" } as const;

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation();
  return <Badge variant={RUN_VARIANTS[status]}>{t(`runs.statuses.${status}`)}</Badge>;
}

/** A wrapping line of short facts, used where a table row is folded into one cell on phones. */
export function RunFacts({ facts, className }: { facts: string[]; className?: string }) {
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs tabular-nums",
        className,
      )}
    >
      {facts.map((fact) => (
        <li key={fact}>{fact}</li>
      ))}
    </ul>
  );
}

export function AccountStatusBadge({ account }: { account: Account }) {
  const { t } = useTranslation();
  if (account.status === "unauthorized") {
    return <Badge variant="error">{t("accounts.status.unauthorized")}</Badge>;
  }
  if (account.running) return <Badge variant="info">{t("accounts.status.running")}</Badge>;
  if (!account.enabled) return <Badge variant="outline">{t("accounts.status.paused")}</Badge>;
  if (account.status === "error")
    return <Badge variant="warning">{t("accounts.status.error")}</Badge>;
  return <Badge variant="success">{t("accounts.status.ok")}</Badge>;
}

/** Shows a known enum value in the current language, or the raw value if GitHub adds a new one. */
export function useEnumLabel(): (
  group: "reasons" | "subjectTypes" | "states",
  value: string,
) => string {
  const { t } = useTranslation();
  return (group, value) => t(`${group}.${value}`, { defaultValue: value });
}
