import { RUN_STATUSES, type RunLog, type RunStatus } from "@mewte/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollTextIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Page, QueryState } from "@/components/page";
import { Pager } from "@/components/pager";
import { RunFacts, RunStatusBadge } from "@/components/run-status";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { keys, useAccounts } from "@/lib/queries";

const ALL = "__all__";
const PAGE_SIZE = 25;

export function RunsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState(ALL);
  const [status, setStatus] = useState<RunStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<RunLog | null>(null);

  const filters = {
    accountId: accountId === ALL ? undefined : accountId,
    status: status === ALL ? undefined : status,
  };
  const filtered = filters.accountId !== undefined || filters.status !== undefined;

  const runs = useQuery({
    queryKey: [...keys.runs, filters, page],
    queryFn: () => api.runs({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const duration = (run: RunLog) => {
    const ms = run.finishedAt - run.startedAt;
    return ms < 1000
      ? t("runs.durationMs", { value: format.number(ms) })
      : t("runs.durationSec", { value: format.number(Math.round(ms / 100) / 10) });
  };

  const errorsButton = (run: RunLog) =>
    run.errors.length > 0 ? (
      <Button onClick={() => setInspecting(run)} size="xs" type="button" variant="outline">
        {t("runs.viewErrors", { count: run.errors.length })}
      </Button>
    ) : null;

  return (
    <Page description={t("runs.description")} title={t("runs.title")}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <SimpleSelect
          ariaLabel={t("runs.filterAccount")}
          className="sm:w-auto sm:min-w-40"
          onChange={(value) => {
            setAccountId(value);
            setPage(1);
          }}
          options={[
            { value: ALL, label: t("runs.allAccounts") },
            ...(accounts.data ?? []).map((account) => ({
              value: account.id,
              label: account.login,
            })),
          ]}
          value={accountId}
        />
        <SimpleSelect<RunStatus | typeof ALL>
          ariaLabel={t("runs.filterStatus")}
          className="sm:w-auto sm:min-w-36"
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: ALL, label: t("runs.allStatuses") },
            ...RUN_STATUSES.map((value) => ({ value, label: t(`runs.statuses.${value}`) })),
          ]}
          value={status}
        />
      </div>

      <QueryState query={runs}>
        {(data) =>
          data.total === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollTextIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{filtered ? t("runs.noResults") : t("runs.empty")}</EmptyTitle>
                {filtered ? null : (
                  <EmptyDescription>{t("runs.emptyDescription")}</EmptyDescription>
                )}
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="max-sm:hidden">
                    <TableRow>
                      <TableHead>{t("runs.time")}</TableHead>
                      <TableHead>{t("runs.account")}</TableHead>
                      <TableHead>{t("runs.trigger")}</TableHead>
                      <TableHead>{t("runs.status")}</TableHead>
                      <TableHead className="text-end">{t("runs.fetched")}</TableHead>
                      <TableHead className="text-end">{t("runs.matched")}</TableHead>
                      <TableHead className="text-end">{t("runs.processed")}</TableHead>
                      <TableHead className="text-end">{t("runs.duration")}</TableHead>
                      <TableHead>{t("runs.errors")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell
                          className="whitespace-nowrap text-muted-foreground max-sm:hidden"
                          title={format.relative(run.startedAt)}
                        >
                          {format.dateTime(run.startedAt)}
                        </TableCell>
                        <TableCell className="max-sm:w-full max-sm:whitespace-normal max-sm:p-3">
                          <span className="max-sm:font-medium">{run.accountLogin}</span>
                          {/* Phones have no room for 9 columns, so the row folds into this cell. */}
                          <div className="mt-1.5 flex flex-col items-start gap-1.5 sm:hidden">
                            <RunFacts
                              facts={[
                                format.dateTime(run.startedAt),
                                t(`runs.triggers.${run.trigger}`),
                              ]}
                            />
                            <RunFacts
                              facts={[
                                `${t("runs.fetched")} ${format.number(run.fetched)}`,
                                `${t("runs.matched")} ${format.number(run.matched)}`,
                                `${t("runs.processed")} ${format.number(run.processed)}`,
                                `${t("runs.duration")} ${duration(run)}`,
                              ]}
                            />
                            {errorsButton(run)}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-sm:hidden">
                          {t(`runs.triggers.${run.trigger}`)}
                        </TableCell>
                        <TableCell className="max-sm:p-3 max-sm:align-top">
                          <RunStatusBadge status={run.status} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums max-sm:hidden">
                          {format.number(run.fetched)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums max-sm:hidden">
                          {format.number(run.matched)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums max-sm:hidden">
                          {format.number(run.processed)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-end text-muted-foreground tabular-nums max-sm:hidden">
                          {duration(run)}
                        </TableCell>
                        <TableCell className="max-sm:hidden">{errorsButton(run)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <Pager
                onPageChange={setPage}
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
              />
            </>
          )
        }
      </QueryState>

      <Dialog onOpenChange={(open) => !open && setInspecting(null)} open={inspecting !== null}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t("runs.errorsTitle")}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <ul className="flex flex-col gap-2">
              {inspecting?.errors.map((error, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- messages may repeat
                <li
                  className="break-words rounded-lg border bg-muted/40 p-2 font-mono text-xs"
                  key={index}
                >
                  {error}
                </li>
              ))}
            </ul>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t("common.close")}
            </DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Page>
  );
}
