import {
  type Account,
  DEFAULT_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  type Rule,
} from "@mewte/shared";
import { useMutation } from "@tanstack/react-query";
import {
  EllipsisIcon,
  ExternalLinkIcon,
  CircleUserRoundIcon,
  InboxIcon,
  InfoIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Page, QueryState } from "@/components/page";
import { AccountStatusBadge } from "@/components/run-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useErrorMessage, useErrorToast } from "@/lib/errors";
import { useFormat } from "@/lib/format";
import { keys, queryClient, useAccounts, useRules } from "@/lib/queries";

const TOKEN_PAGE = "https://github.com/settings/tokens/new?scopes=notifications&description=Mewte";
const MIN_MINUTES = MIN_INTERVAL_SEC / 60;
const MAX_MINUTES = MAX_INTERVAL_SEC / 60;

function refreshAccounts() {
  void queryClient.invalidateQueries({ queryKey: keys.accounts });
  void queryClient.invalidateQueries({ queryKey: keys.dashboard });
}

function IntervalField({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel>{t("accounts.interval")}</FieldLabel>
      <div className="flex items-center gap-2">
        <NumberField
          className="w-36"
          max={MAX_MINUTES}
          min={MIN_MINUTES}
          onValueChange={(value) => onChange(value ?? MIN_MINUTES)}
          step={1}
          value={minutes}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={t("common.decrease")} />
            <NumberFieldInput />
            <NumberFieldIncrement aria-label={t("common.increase")} />
          </NumberFieldGroup>
        </NumberField>
        <span className="text-muted-foreground text-sm">{t("common.minutesUnit")}</span>
      </div>
      <FieldDescription>{t("accounts.intervalHint")}</FieldDescription>
    </Field>
  );
}

function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [token, setToken] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_INTERVAL_SEC / 60);

  const create = useMutation({
    mutationFn: api.createAccount,
    onSuccess: () => {
      refreshAccounts();
      toastManager.add({ type: "success", title: t("accounts.added") });
      setToken("");
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ token: token.trim(), intervalSec: minutes * 60 });
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("accounts.addTitle")}</DialogTitle>
          <DialogDescription>{t("accounts.addDescription")}</DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <DialogPanel className="flex flex-col gap-4">
            {create.isError ? (
              <Alert variant="error">
                <AlertDescription>{message(create.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="font-medium">{t("accounts.howToTitle")}</span>
              <ol className="flex list-decimal flex-col gap-1 ps-5 text-muted-foreground">
                <li>{t("accounts.howToStep1")}</li>
                <li>{t("accounts.howToStep2")}</li>
                <li>{t("accounts.howToStep3")}</li>
                <li>{t("accounts.howToStep4")}</li>
              </ol>
              <Button
                className="self-start"
                render={<a href={TOKEN_PAGE} rel="noreferrer" target="_blank" />}
                size="sm"
                variant="outline"
              >
                <ExternalLinkIcon aria-hidden="true" />
                {t("accounts.openTokenPage")}
              </Button>
            </div>
            <Field>
              <FieldLabel>{t("accounts.token")}</FieldLabel>
              <Input
                autoComplete="off"
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("accounts.tokenPlaceholder")}
                required
                spellCheck={false}
                type="password"
                value={token}
              />
              <FieldDescription>{t("accounts.tokenStorage")}</FieldDescription>
            </Field>
            <IntervalField minutes={minutes} onChange={setMinutes} />
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button loading={create.isPending} type="submit">
              {t("accounts.connect")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function EditAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [token, setToken] = useState("");
  const [minutes, setMinutes] = useState(Math.round(account.intervalSec / 60));

  const update = useMutation({
    mutationFn: () =>
      api.updateAccount(account.id, {
        intervalSec: minutes * 60,
        token: token.trim() ? token.trim() : undefined,
      }),
    onSuccess: () => {
      refreshAccounts();
      toastManager.add({ type: "success", title: t("accounts.updated") });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("accounts.editTitle", { login: account.login })}</DialogTitle>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <DialogPanel className="flex flex-col gap-4">
            {update.isError ? (
              <Alert variant="error">
                <AlertDescription>{message(update.error)}</AlertDescription>
              </Alert>
            ) : null}
            <IntervalField minutes={minutes} onChange={setMinutes} />
            <Field>
              <FieldLabel>{t("accounts.replaceToken")}</FieldLabel>
              <Input
                autoComplete="off"
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("accounts.tokenPlaceholder")}
                spellCheck={false}
                type="password"
                value={token}
              />
              <FieldDescription>{t("accounts.replaceTokenHint")}</FieldDescription>
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button loading={update.isPending} type="submit">
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Whether an enabled rule applies to the account. Without one a run can only count. */
function hasRule(rules: Rule[], accountId: string): boolean {
  return rules.some(
    (rule) =>
      rule.enabled &&
      (rule.accountScope.type === "all" || rule.accountScope.accountIds.includes(accountId)),
  );
}

function AccountCard({
  account,
  rules,
  onEdit,
  onDelete,
}: {
  account: Account;
  /** Undefined until the rules have loaded. */
  rules: Rule[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const onError = useErrorToast();
  const switchId = useId();
  const [confirmingBacklog, setConfirmingBacklog] = useState(false);
  const noRules = rules !== undefined && !hasRule(rules, account.id);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.updateAccount(account.id, { enabled }),
    onError,
    onSuccess: refreshAccounts,
  });

  const run = useMutation({
    mutationFn: (trigger: "manual" | "backlog") =>
      trigger === "backlog" ? api.runBacklog(account.id) : api.runAccount(account.id),
    onError,
    onSettled: () => {
      setConfirmingBacklog(false);
      refreshAccounts();
      void queryClient.invalidateQueries({ queryKey: keys.runs });
      void queryClient.invalidateQueries({ queryKey: keys.history });
    },
    onSuccess: (result) => {
      toastManager.add({
        type:
          result.status === "error" ? "error" : result.status === "partial" ? "warning" : "success",
        title: result.status === "error" ? t("accounts.runFailed") : t("accounts.runFinished"),
        description:
          result.status === "error"
            ? result.errors[0]
            : noRules
              ? t("accounts.runNoRules", { fetched: result.fetched })
              : t("accounts.runSummary", {
                  fetched: result.fetched,
                  matched: result.matched,
                  processed: result.processed,
                }),
      });
    },
  });

  const busy = run.isPending || account.running;

  return (
    <Card className="overflow-hidden">
      <CardPanel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Avatar className="size-11">
            <AvatarImage alt="" src={account.avatarUrl} />
            <AvatarFallback>{account.login.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-heading font-semibold text-base">{account.login}</span>
              <AccountStatusBadge account={{ ...account, running: busy }} />
            </div>
            <span className="text-muted-foreground text-sm">
              {t("common.everyMinutes", { count: Math.round(account.intervalSec / 60) })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 pe-2">
              <Switch
                checked={account.enabled}
                disabled={toggle.isPending}
                id={switchId}
                onCheckedChange={(checked) => toggle.mutate(checked)}
              />
              <Label className="font-normal text-muted-foreground" htmlFor={switchId}>
                {t("accounts.enabledLabel")}
              </Label>
            </div>
            <Button
              loading={busy}
              onClick={() => run.mutate("manual")}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlayIcon aria-hidden="true" />
              {busy ? t("accounts.running") : t("accounts.runNow")}
            </Button>
            <Menu>
              <MenuTrigger
                render={
                  <Button aria-label={t("common.moreActions")} size="icon-sm" variant="ghost" />
                }
              >
                <EllipsisIcon aria-hidden="true" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={onEdit}>
                  <PencilIcon aria-hidden="true" />
                  {t("common.edit")}
                </MenuItem>
                <MenuItem disabled={busy || noRules} onClick={() => setConfirmingBacklog(true)}>
                  <InboxIcon aria-hidden="true" />
                  {t("accounts.backlog")}
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={onDelete} variant="destructive">
                  <Trash2Icon aria-hidden="true" />
                  {t("accounts.deleteConfirm")}
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </div>

        {account.status === "unauthorized" ? (
          <Alert variant="error">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertDescription>{t("accounts.unauthorizedHint")}</AlertDescription>
          </Alert>
        ) : account.status === "error" && account.lastError ? (
          <Alert variant="warning">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertDescription className="break-words">{account.lastError}</AlertDescription>
          </Alert>
        ) : null}
        {noRules ? (
          <Alert variant="info">
            <InfoIcon aria-hidden="true" />
            <AlertDescription>
              <span>
                {t("accounts.noRules")}{" "}
                <Link className="font-medium text-foreground underline" to="/rules/new">
                  {t("dashboard.createRule")}
                </Link>
              </span>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardPanel>

      <dl className="grid grid-cols-1 divide-y border-t bg-muted/40 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="flex flex-col gap-1 px-5 py-3">
          <dt className="text-muted-foreground text-xs">{t("accounts.lastRun")}</dt>
          <dd
            className="font-medium"
            title={account.lastRunAt ? format.dateTime(account.lastRunAt) : undefined}
          >
            {account.lastRunAt ? format.relative(account.lastRunAt) : t("common.never")}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-3">
          <dt className="text-muted-foreground text-xs">{t("accounts.nextRun")}</dt>
          <dd
            className="font-medium"
            title={
              account.enabled && account.nextRunAt ? format.dateTime(account.nextRunAt) : undefined
            }
          >
            {account.enabled && account.nextRunAt
              ? format.upcoming(account.nextRunAt)
              : t("common.never")}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-3">
          <dt className="text-muted-foreground text-xs">{t("accounts.scopes")}</dt>
          <dd className="flex flex-wrap gap-1">
            {account.scopes.map((scope) => (
              <Badge key={scope} variant="outline">
                {scope}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>

      {account.scopes.includes("repo") ? null : (
        <p className="border-t px-5 py-3 text-muted-foreground text-xs">
          {t("accounts.noRepoScope")}
        </p>
      )}

      <ConfirmDialog
        confirmLabel={t("accounts.backlogConfirm")}
        description={t("accounts.backlogDescription")}
        onConfirm={() => run.mutate("backlog")}
        onOpenChange={(open) => !open && !run.isPending && setConfirmingBacklog(false)}
        open={confirmingBacklog}
        pending={run.isPending}
        title={t("accounts.backlogTitle", { login: account.login })}
      />
    </Card>
  );
}

export function AccountsPage() {
  const { t } = useTranslation();
  const onError = useErrorToast();
  const accounts = useAccounts({ poll: true });
  const rules = useRules();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onError,
    onSuccess: () => {
      refreshAccounts();
      toastManager.add({ type: "success", title: t("accounts.deleted") });
    },
    onSettled: () => setDeleting(null),
  });

  const addButton = (
    <Button onClick={() => setAdding(true)} type="button">
      <PlusIcon aria-hidden="true" />
      {t("accounts.add")}
    </Button>
  );

  return (
    <Page actions={addButton} description={t("accounts.description")} title={t("accounts.title")}>
      <QueryState query={accounts}>
        {(list) =>
          list.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleUserRoundIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("accounts.empty")}</EmptyTitle>
                <EmptyDescription>{t("accounts.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{addButton}</EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {list.map((account) => (
                <AccountCard
                  account={account}
                  key={account.id}
                  rules={rules.data}
                  onDelete={() => setDeleting(account)}
                  onEdit={() => setEditing(account)}
                />
              ))}
            </div>
          )
        }
      </QueryState>

      <AddAccountDialog onOpenChange={setAdding} open={adding} />
      {editing ? (
        <EditAccountDialog account={editing} key={editing.id} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        confirmLabel={t("accounts.deleteConfirm")}
        description={t("accounts.deleteDescription")}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
        pending={remove.isPending}
        title={t("accounts.deleteTitle", { login: deleting?.login ?? "" })}
      />
    </Page>
  );
}
