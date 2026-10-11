import type { Dashboard } from "@mewte/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  CircleUserRoundIcon,
  ListFilterIcon,
  ScrollTextIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Page, QueryState } from "@/components/page";
import { RunFacts, RunStatusBadge } from "@/components/run-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { keys } from "@/lib/queries";

interface CountCardProps {
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  caption: string;
  warning?: string | undefined;
}

/** A count that links to the page where it can be changed. The whole card is the link. */
function CountCard({ to, icon: Icon, label, value, caption, warning }: CountCardProps) {
  return (
    <Card className="relative transition-colors hover:bg-accent/40">
      <CardPanel className="flex items-center gap-4 max-sm:p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground max-sm:hidden">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link className="text-muted-foreground text-sm after:absolute after:inset-0" to={to}>
            {label}
          </Link>
          <span className="font-heading font-semibold text-2xl tabular-nums">{value}</span>
          <span className="truncate text-muted-foreground text-xs">{caption}</span>
          {warning ? (
            <span className="truncate text-warning-foreground text-xs">{warning}</span>
          ) : null}
        </div>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </CardPanel>
    </Card>
  );
}

function ClearedCard({ data, className }: { data: Dashboard; className?: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { daily } = data;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const totals = [
    { label: t("dashboard.last24h"), value: data.processed.last24h },
    { label: t("dashboard.last7d"), value: data.processed.last7d },
    { label: t("dashboard.allTime"), value: data.processed.total },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("dashboard.chartTitle")}</CardTitle>
        <CardDescription>{t("dashboard.chartDescription")}</CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-6">
        <dl className="grid grid-cols-3 divide-x">
          {totals.map((total) => (
            <div className="flex flex-col gap-1 px-4 first:ps-0 last:pe-0" key={total.label}>
              <dt className="truncate text-muted-foreground text-xs sm:text-sm">{total.label}</dt>
              <dd className="font-heading font-semibold text-2xl tabular-nums sm:text-3xl">
                {format.number(total.value)}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <ol className="flex h-24 items-end gap-1 sm:h-32 sm:gap-2">
            {daily.map((day) => {
              const label = t("dashboard.chartBar", {
                date: format.day(day.date),
                count: day.count,
              });
              return (
                <li
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  key={day.date}
                  title={label}
                >
                  <span className="text-muted-foreground text-xs tabular-nums max-sm:hidden">
                    {day.count > 0 ? format.number(day.count) : ""}
                  </span>
                  <div
                    aria-label={label}
                    className={
                      day.count > 0
                        ? "w-full rounded-sm bg-primary/80"
                        : "w-full rounded-sm bg-muted"
                    }
                    role="img"
                    style={{ height: `${Math.max(2, (day.count / max) * 100)}%` }}
                  />
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex justify-between text-muted-foreground text-xs">
            <span>{daily[0] ? format.day(daily[0].date) : null}</span>
            <span>{daily.at(-1) ? format.day(daily.at(-1)!.date) : null}</span>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}

function RecentRuns({ runs }: { runs: Dashboard["recentRuns"] }) {
  const { t } = useTranslation();
  const format = useFormat();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.recentRuns")}</CardTitle>
        <CardAction>
          <Button render={<Link to="/runs" />} size="sm" variant="ghost">
            {t("dashboard.viewAllRuns")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel>
        {runs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("dashboard.noRuns")}</EmptyTitle>
              <EmptyDescription>{t("dashboard.noRunsDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="max-sm:hidden">
              <TableRow>
                <TableHead>{t("runs.time")}</TableHead>
                <TableHead>{t("runs.account")}</TableHead>
                <TableHead>{t("runs.status")}</TableHead>
                <TableHead className="text-end">{t("runs.fetched")}</TableHead>
                <TableHead className="text-end">{t("runs.processed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell
                    className="whitespace-nowrap text-muted-foreground max-sm:hidden"
                    title={format.dateTime(run.startedAt)}
                  >
                    {format.relative(run.startedAt)}
                  </TableCell>
                  <TableCell className="max-sm:w-full max-sm:whitespace-normal max-sm:ps-0">
                    {run.accountLogin}
                    {/* Phones have no room for the columns, so the numbers move under the account. */}
                    <RunFacts
                      className="mt-1.5 sm:hidden"
                      facts={[
                        format.relative(run.startedAt),
                        `${t("runs.fetched")} ${format.number(run.fetched)}`,
                        `${t("runs.processed")} ${format.number(run.processed)}`,
                      ]}
                    />
                  </TableCell>
                  <TableCell className="max-sm:pe-0 max-sm:text-end">
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums max-sm:hidden">
                    {format.number(run.fetched)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums max-sm:hidden">
                    {format.number(run.processed)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  );
}

function GetStarted({ needsAccount }: { needsAccount: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.getStartedTitle")}</CardTitle>
        <CardDescription>{t("dashboard.getStartedDescription")}</CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-wrap gap-2">
        <Button render={<Link to="/accounts" />} variant={needsAccount ? "default" : "outline"}>
          <CircleUserRoundIcon aria-hidden="true" />
          {t("dashboard.connectAccount")}
        </Button>
        <Button render={<Link to="/rules/new" />} variant={needsAccount ? "outline" : "default"}>
          <ListFilterIcon aria-hidden="true" />
          {t("dashboard.createRule")}
        </Button>
      </CardPanel>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const dashboard = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.dashboard(-new Date().getTimezoneOffset()),
    refetchInterval: 30_000,
  });

  return (
    <Page title={t("dashboard.title")}>
      <QueryState query={dashboard}>
        {(data) => (
          <>
            {data.accounts.total === 0 || data.rules.total === 0 ? (
              <GetStarted needsAccount={data.accounts.total === 0} />
            ) : null}
            <div className="grid gap-4 lg:grid-cols-3">
              <ClearedCard className="lg:col-span-2" data={data} />
              <div className="grid grid-cols-2 content-start gap-4 lg:grid-cols-1">
                <CountCard
                  caption={t("dashboard.accountsValue", data.accounts)}
                  icon={CircleUserRoundIcon}
                  label={t("dashboard.accounts")}
                  to="/accounts"
                  value={format.number(data.accounts.enabled)}
                  warning={
                    data.accounts.unhealthy > 0
                      ? t("dashboard.accountsUnhealthy", { count: data.accounts.unhealthy })
                      : undefined
                  }
                />
                <CountCard
                  caption={t("dashboard.rulesValue", data.rules)}
                  icon={ListFilterIcon}
                  label={t("dashboard.rules")}
                  to="/rules"
                  value={format.number(data.rules.enabled)}
                />
              </div>
            </div>
            <RecentRuns runs={data.recentRuns} />
          </>
        )}
      </QueryState>
    </Page>
  );
}
