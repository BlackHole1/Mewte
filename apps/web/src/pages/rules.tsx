import type { Rule, RulesSource } from "@mewte/shared";
import { useMutation } from "@tanstack/react-query";
import {
  CircleAlertIcon,
  CopyIcon,
  EllipsisIcon,
  FileCodeIcon,
  ListFilterIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Page, QueryState } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useErrorToast } from "@/lib/errors";
import { keys, queryClient, useAccounts, useRules, useRulesSource } from "@/lib/queries";

export function refreshRules() {
  void queryClient.invalidateQueries({ queryKey: keys.rules });
  void queryClient.invalidateQueries({ queryKey: keys.dashboard });
}

function ScopeLabel({ rule }: { rule: Rule }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  if (rule.accountScope.type === "all") return <>{t("rules.scopeAll")}</>;
  const ids = rule.accountScope.accountIds;
  const names = ids
    .map((id) => accounts.data?.find((account) => account.id === id)?.login)
    .filter((login) => login !== undefined);
  return (
    <>
      {names.length === ids.length && names.length <= 2
        ? names.join(", ")
        : t("rules.scopeCount", { count: ids.length })}
    </>
  );
}

/** Says which file mirrors the rules, and why its current content was not applied if it was not. */
function RulesFileNotice({ source }: { source: RulesSource }) {
  const { t } = useTranslation();
  if (!source.enabled || source.path === null) return null;

  if (source.problems.length > 0) {
    return (
      <Alert variant="error">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>{t("rules.fileInvalid")}</AlertTitle>
        <AlertDescription>
          <p>{t("rules.fileInvalidHint", { path: source.path })}</p>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {source.problems.map((problem) => (
              <li className="break-words" key={`${problem.line}:${problem.message}`}>
                {problem.line === null
                  ? problem.message
                  : t("rules.fileProblemLine", { line: problem.line, message: problem.message })}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="flex items-start gap-2 text-muted-foreground text-sm">
      <FileCodeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{t("rules.fileSynced", { path: source.path })}</span>
    </p>
  );
}

export function RulesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onError = useErrorToast();
  const source = useRulesSource();
  const rules = useRules({ poll: source.data?.enabled === true });
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, createdAt: _c, updatedAt: _u, ...input }: Rule) =>
      api.updateRule(id, { ...input, enabled: !input.enabled }),
    onError,
    onSuccess: refreshRules,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onError,
    onSuccess: () => {
      refreshRules();
      toastManager.add({ type: "success", title: t("rules.deleted") });
    },
    onSettled: () => setDeleting(null),
  });

  const addButton = (
    <Button render={<Link to="/rules/new" />}>
      <PlusIcon aria-hidden="true" />
      {t("rules.add")}
    </Button>
  );

  return (
    <Page actions={addButton} description={t("rules.description")} title={t("rules.title")}>
      {source.data ? <RulesFileNotice source={source.data} /> : null}
      <QueryState query={rules}>
        {(list) =>
          list.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListFilterIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("rules.empty")}</EmptyTitle>
                <EmptyDescription>{t("rules.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{addButton}</EmptyContent>
            </Empty>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="max-sm:hidden">
                  <TableRow>
                    <TableHead className="w-20">{t("rules.priority")}</TableHead>
                    <TableHead>{t("rules.name")}</TableHead>
                    <TableHead>{t("rules.scope")}</TableHead>
                    <TableHead>{t("rules.action")}</TableHead>
                    <TableHead>{t("rules.enabledLabel")}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t("common.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="text-muted-foreground tabular-nums max-sm:hidden">
                        {rule.priority}
                      </TableCell>
                      <TableCell className="max-sm:w-full max-sm:max-w-0 max-sm:whitespace-normal max-sm:p-3">
                        <Link
                          className="font-medium underline-offset-4 hover:underline max-sm:line-clamp-2 max-sm:break-words max-sm:leading-snug"
                          to={`/rules/${rule.id}`}
                        >
                          {rule.name}
                        </Link>
                        {/* Phones show priority and scope under the name instead of in columns. */}
                        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs sm:hidden">
                          <li className="tabular-nums">
                            {t("rules.priority")} {rule.priority}
                          </li>
                          <li>
                            <ScopeLabel rule={rule} />
                          </li>
                        </ul>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-sm:hidden">
                        <ScopeLabel rule={rule} />
                      </TableCell>
                      <TableCell className="text-muted-foreground max-sm:hidden">
                        {t("rules.actionMarkDone")}
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={t("rules.enabledLabel")}
                          checked={rule.enabled}
                          disabled={toggle.isPending}
                          onCheckedChange={() => toggle.mutate(rule)}
                        />
                      </TableCell>
                      <TableCell>
                        <Menu>
                          <MenuTrigger
                            render={
                              <Button
                                aria-label={t("common.moreActions")}
                                size="icon-sm"
                                variant="ghost"
                              />
                            }
                          >
                            <EllipsisIcon aria-hidden="true" />
                          </MenuTrigger>
                          <MenuPopup align="end">
                            <MenuItem onClick={() => void navigate(`/rules/${rule.id}`)}>
                              <PencilIcon aria-hidden="true" />
                              {t("common.edit")}
                            </MenuItem>
                            <MenuItem
                              onClick={() =>
                                void navigate("/rules/new", { state: { copyFrom: rule } })
                              }
                            >
                              <CopyIcon aria-hidden="true" />
                              {t("rules.duplicate")}
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem onClick={() => setDeleting(rule)} variant="destructive">
                              <Trash2Icon aria-hidden="true" />
                              {t("common.delete")}
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        }
      </QueryState>

      <ConfirmDialog
        confirmLabel={t("common.delete")}
        description={t("rules.deleteDescription")}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
        pending={remove.isPending}
        title={t("rules.deleteTitle", { name: deleting?.name ?? "" })}
      />
    </Page>
  );
}
