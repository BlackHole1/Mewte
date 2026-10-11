import { KNOWN_REASONS, KNOWN_SUBJECT_TYPES } from "@mewte/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, HistoryIcon, SearchIcon } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Page, QueryState } from "@/components/page";
import { Pager } from "@/components/pager";
import { useEnumLabel } from "@/components/run-status";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
import { useDebounced } from "@/lib/use-debounced";

const ALL = "__all__";
const PAGE_SIZE = 25;

/** Lets a click anywhere on a row open the thread, without hijacking links or text selection. */
function openRow(event: MouseEvent<HTMLTableRowElement>, url: string) {
  if ((event.target as HTMLElement).closest("a, button")) return;
  if (window.getSelection()?.toString()) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function HistoryPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const label = useEnumLabel();
  const accounts = useAccounts();
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState(ALL);
  const [subjectType, setSubjectType] = useState(ALL);
  const [reason, setReason] = useState(ALL);
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());

  const filters = {
    q: q || undefined,
    accountId: accountId === ALL ? undefined : accountId,
    subjectType: subjectType === ALL ? undefined : subjectType,
    reason: reason === ALL ? undefined : reason,
  };
  const filtered = Object.values(filters).some((value) => value !== undefined);

  const history = useQuery({
    queryKey: [...keys.history, filters, page],
    queryFn: () => api.history({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  function clear() {
    setSearch("");
    setAccountId(ALL);
    setSubjectType(ALL);
    setReason(ALL);
    setPage(1);
  }

  return (
    <Page description={t("history.description")} title={t("history.title")}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <InputGroup className="col-span-2 sm:w-72">
          <InputGroupInput
            aria-label={t("history.searchPlaceholder")}
            onChange={(event) => change(setSearch)(event.target.value)}
            placeholder={t("history.searchPlaceholder")}
            type="search"
            value={search}
          />
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
        <SimpleSelect
          ariaLabel={t("history.filterAccount")}
          className="col-span-2 sm:w-auto sm:min-w-40"
          onChange={change(setAccountId)}
          options={[
            { value: ALL, label: t("history.allAccounts") },
            ...(accounts.data ?? []).map((account) => ({
              value: account.id,
              label: account.login,
            })),
          ]}
          value={accountId}
        />
        <SimpleSelect
          ariaLabel={t("history.filterType")}
          className="sm:w-auto sm:min-w-36"
          onChange={change(setSubjectType)}
          options={[
            { value: ALL, label: t("history.allTypes") },
            ...KNOWN_SUBJECT_TYPES.map((value) => ({ value, label: label("subjectTypes", value) })),
          ]}
          value={subjectType}
        />
        <SimpleSelect
          ariaLabel={t("history.filterReason")}
          className="sm:w-auto sm:min-w-36"
          onChange={change(setReason)}
          options={[
            { value: ALL, label: t("history.allReasons") },
            ...KNOWN_REASONS.map((value) => ({ value, label: label("reasons", value) })),
          ]}
          value={reason}
        />
        {filtered || search ? (
          <Button className="col-span-2" onClick={clear} type="button" variant="ghost">
            {t("history.clearFilters")}
          </Button>
        ) : null}
      </div>

      <QueryState query={history}>
        {(data) =>
          data.total === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HistoryIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{filtered ? t("history.noResults") : t("history.empty")}</EmptyTitle>
                {filtered ? null : (
                  <EmptyDescription>{t("history.emptyDescription")}</EmptyDescription>
                )}
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="max-sm:hidden">
                    <TableRow>
                      <TableHead>{t("history.time")}</TableHead>
                      <TableHead>{t("history.notification")}</TableHead>
                      <TableHead>{t("history.type")}</TableHead>
                      <TableHead>{t("history.reason")}</TableHead>
                      <TableHead>{t("history.rule")}</TableHead>
                      <TableHead>{t("history.account")}</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">{t("common.actions")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow
                        className="cursor-pointer"
                        key={item.id}
                        onClick={(event) => openRow(event, item.url)}
                      >
                        <TableCell
                          className="whitespace-nowrap text-muted-foreground max-sm:hidden"
                          title={format.dateTime(item.processedAt)}
                        >
                          {format.relative(item.processedAt)}
                        </TableCell>
                        <TableCell className="w-full max-w-0 whitespace-normal max-sm:p-3 sm:min-w-64">
                          <div className="flex flex-col gap-0.5">
                            {/* Long titles wrap onto a second line, then end in an ellipsis. */}
                            <a
                              className="line-clamp-2 break-words font-medium leading-snug underline-offset-4 hover:underline"
                              href={item.url}
                              rel="noreferrer"
                              target="_blank"
                              title={item.title}
                            >
                              {item.title}
                            </a>
                            <span className="truncate text-muted-foreground text-xs">
                              {item.repo}
                            </span>
                            {/* Phones show the other columns as a wrapping line under the title. */}
                            <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs sm:hidden">
                              <li>
                                <Badge variant="outline">
                                  {label("subjectTypes", item.subjectType)}
                                </Badge>
                              </li>
                              <li>{label("reasons", item.reason)}</li>
                              <li className="max-w-full truncate">{item.ruleName}</li>
                              <li>{item.accountLogin}</li>
                              <li>{format.relative(item.processedAt)}</li>
                            </ul>
                          </div>
                        </TableCell>
                        <TableCell className="max-sm:hidden">
                          <Badge variant="outline">{label("subjectTypes", item.subjectType)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-sm:hidden">
                          {label("reasons", item.reason)}
                        </TableCell>
                        <TableCell
                          className="max-w-48 truncate max-sm:hidden"
                          title={item.ruleName}
                        >
                          {item.ruleName}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-sm:hidden">
                          {item.accountLogin}
                        </TableCell>
                        <TableCell className="max-sm:hidden">
                          <Button
                            aria-label={t("common.openOnGithub")}
                            render={<a href={item.url} rel="noreferrer" target="_blank" />}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <ExternalLinkIcon aria-hidden="true" />
                          </Button>
                        </TableCell>
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
    </Page>
  );
}
