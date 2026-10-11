import {
  type AccountScope,
  type ConditionGroup,
  type DryRunResult,
  type NotificationPreview,
  type Rule,
  type RuleInput,
  conditionSchema,
  defaultLeaf,
  ruleInputSchema,
} from "@mewte/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ConditionEditor } from "@/components/condition-editor";
import { ErrorBlock, LoadingBlock, Page } from "@/components/page";
import { useEnumLabel } from "@/components/run-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { toastManager } from "@/components/ui/toast";
import { ApiRequestError, api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errors";
import { keys, useAccounts } from "@/lib/queries";
import { refreshRules } from "./rules";

function emptyRule(): RuleInput {
  return {
    name: "",
    enabled: true,
    priority: 100,
    accountScope: { type: "all" },
    condition: { type: "group", op: "and", children: [defaultLeaf("repo")] },
    action: "mark_done",
  };
}

function toInput({ id: _id, createdAt: _c, updatedAt: _u, ...input }: Rule): RuleInput {
  return input;
}

function ScopeField({
  scope,
  onChange,
  invalid,
}: {
  scope: AccountScope;
  onChange: (scope: AccountScope) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const allId = useId();
  const selectedId = useId();
  const selected = scope.type === "accounts" ? scope.accountIds : [];

  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-sm">{t("rules.scope")}</span>
      <RadioGroup
        onValueChange={(value) =>
          onChange(value === "all" ? { type: "all" } : { type: "accounts", accountIds: selected })
        }
        value={scope.type}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id={allId} value="all" />
          <Label className="font-normal" htmlFor={allId}>
            {t("rules.scopeAll")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={selectedId} value="accounts" />
          <Label className="font-normal" htmlFor={selectedId}>
            {t("rules.scopeSelected")}
          </Label>
        </div>
      </RadioGroup>
      {scope.type === "accounts" ? (
        <div className="flex flex-col gap-2 ps-6">
          {accounts.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("rules.noAccounts")}</p>
          ) : null}
          {accounts.data?.map((account) => (
            <Label className="font-normal" key={account.id}>
              <Checkbox
                checked={selected.includes(account.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    type: "accounts",
                    accountIds: checked
                      ? [...selected, account.id]
                      : selected.filter((id) => id !== account.id),
                  })
                }
              />
              {account.login}
            </Label>
          ))}
          {invalid && selected.length === 0 ? (
            <p className="text-destructive-foreground text-xs">{t("rules.scopeEmpty")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PreviewList({
  items,
  hint,
}: {
  items: NotificationPreview[];
  hint?: (item: NotificationPreview) => string;
}) {
  const { t } = useTranslation();
  const label = useEnumLabel();
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {items.map((item) => (
        <li className="flex items-center gap-3 px-3 py-2 text-sm" key={item.threadId}>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="line-clamp-2 break-words" title={item.title}>
              {item.title}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {item.repo} / {label("subjectTypes", item.subjectType)} /{" "}
              {label("reasons", item.reason)}
            </span>
            {hint ? <span className="text-warning-foreground text-xs">{hint(item)}</span> : null}
          </div>
          <Button
            aria-label={t("common.openOnGithub")}
            render={<a href={item.url} rel="noreferrer" target="_blank" />}
            size="icon-sm"
            variant="ghost"
          >
            <ExternalLinkIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function PreviewResults({ result }: { result: DryRunResult }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {result.accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("rules.noAccounts")}</p>
      ) : null}
      {result.accounts.map((account) => (
        <div className="flex flex-col gap-2" key={account.accountId}>
          <span className="font-medium text-sm">
            {t("rules.previewAccount", {
              login: account.login,
              matched: account.matches.length,
              fetched: account.fetched,
            })}
          </span>
          {account.error ? (
            <Alert variant="warning">
              <AlertDescription className="break-words">
                {t("rules.previewError", { message: account.error })}
              </AlertDescription>
            </Alert>
          ) : null}
          {account.matches.length === 0 && !account.error ? (
            <p className="text-muted-foreground text-sm">{t("rules.previewNoMatch")}</p>
          ) : null}
          {account.matches.length > 0 ? <PreviewList items={account.matches} /> : null}
          {account.undecided.length > 0 ? (
            <>
              <span className="text-muted-foreground text-sm">
                {t("rules.previewUndecided", { count: account.undecided.length })}
              </span>
              <PreviewList
                hint={(item) =>
                  item.private && !account.repoScope
                    ? t("rules.previewUndecidedPrivate")
                    : t("rules.previewUndecidedOther")
                }
                items={account.undecided}
              />
            </>
          ) : null}
        </div>
      ))}
      {result.accounts.length > 0 ? (
        <p className="text-muted-foreground text-xs">{t("rules.previewBacklogHint")}</p>
      ) : null}
    </div>
  );
}

function RuleForm({ initial, ruleId }: { initial: RuleInput; ruleId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const message = useErrorMessage();
  const enabledId = useId();
  const [rule, setRule] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<RuleInput>) => setRule((current) => ({ ...current, ...changes }));

  const save = useMutation({
    mutationFn: (input: RuleInput) =>
      ruleId ? api.updateRule(ruleId, input) : api.createRule(input),
    onSuccess: () => {
      refreshRules();
      toastManager.add({
        type: "success",
        title: ruleId ? t("rules.updated") : t("rules.created"),
      });
      void navigate("/rules");
    },
  });

  const preview = useMutation({ mutationFn: api.dryRun });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ruleInputSchema.safeParse(rule);
    if (!parsed.success) {
      setShowErrors(true);
      return;
    }
    save.mutate(parsed.data);
  }

  function runPreview() {
    if (
      !conditionSchema.safeParse(rule.condition).success ||
      !ruleInputSchema.shape.accountScope.safeParse(rule.accountScope).success
    ) {
      setShowErrors(true);
      return;
    }
    preview.mutate({ accountScope: rule.accountScope, condition: rule.condition });
  }

  const invalid = showErrors && !ruleInputSchema.safeParse(rule).success;

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
      {save.isError ? (
        <Alert variant="error">
          <AlertDescription>{message(save.error)}</AlertDescription>
        </Alert>
      ) : null}
      {invalid ? (
        <Alert variant="error">
          <AlertDescription>{t("rules.invalid")}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardPanel className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{t("rules.name")}</FieldLabel>
              <Input
                aria-invalid={(showErrors && !rule.name.trim()) || undefined}
                maxLength={200}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder={t("rules.namePlaceholder")}
                type="text"
                value={rule.name}
              />
            </Field>
            <Field>
              <FieldLabel>{t("rules.priority")}</FieldLabel>
              <NumberField
                className="w-40"
                max={100_000}
                min={0}
                onValueChange={(value) => patch({ priority: value ?? 0 })}
                value={rule.priority}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement aria-label={t("common.decrease")} />
                  <NumberFieldInput />
                  <NumberFieldIncrement aria-label={t("common.increase")} />
                </NumberFieldGroup>
              </NumberField>
              <FieldDescription>{t("rules.priorityHint")}</FieldDescription>
            </Field>
            <div className="flex items-center gap-2">
              <Switch
                checked={rule.enabled}
                id={enabledId}
                onCheckedChange={(enabled) => patch({ enabled })}
              />
              <Label htmlFor={enabledId}>{t("rules.enabledLabel")}</Label>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <ScopeField
              invalid={showErrors}
              onChange={(accountScope) => patch({ accountScope })}
              scope={rule.accountScope}
            />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm">{t("rules.action")}</span>
              <span className="text-sm">{t("rules.actionMarkDone")}</span>
              <span className="text-muted-foreground text-xs">{t("rules.actionHint")}</span>
            </div>
          </div>
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rules.condition")}</CardTitle>
          <CardDescription>{t("rules.conditionHint")}</CardDescription>
        </CardHeader>
        <CardPanel>
          <ConditionEditor
            onChange={(condition) => patch({ condition })}
            showErrors={showErrors}
            value={rule.condition as ConditionGroup}
          />
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("rules.previewTitle")}</CardTitle>
          <CardDescription>{t("rules.previewDescription")}</CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">
          <Button
            className="self-start"
            loading={preview.isPending}
            onClick={runPreview}
            type="button"
            variant="outline"
          >
            <FlaskConicalIcon aria-hidden="true" />
            {preview.isPending ? t("rules.previewRunning") : t("rules.previewRun")}
          </Button>
          {preview.isError ? (
            <Alert variant="error">
              <AlertDescription>{message(preview.error)}</AlertDescription>
            </Alert>
          ) : null}
          {preview.data && !preview.isPending ? <PreviewResults result={preview.data} /> : null}
        </CardPanel>
      </Card>

      {/* The form is long on phones, so the buttons stay pinned to the bottom of the screen there. */}
      <div className="flex justify-end gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:-mb-4 max-sm:border-t max-sm:bg-background/90 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur">
        <Button
          className="max-sm:flex-1 max-sm:border-input"
          render={<Link to="/rules" />}
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button className="max-sm:flex-1" loading={save.isPending} type="submit">
          {ruleId ? t("common.saveChanges") : t("common.create")}
        </Button>
      </div>
    </form>
  );
}

export function RuleEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const existing = useQuery({
    queryKey: keys.rule(id ?? ""),
    queryFn: () => api.rule(id!),
    enabled: id !== undefined,
    staleTime: 0,
    gcTime: 0,
  });

  if (id === undefined) {
    const copyFrom = (location.state as { copyFrom?: Rule } | null)?.copyFrom;
    const initial = copyFrom
      ? { ...toInput(copyFrom), name: t("rules.copyOf", { name: copyFrom.name }) }
      : emptyRule();
    return (
      <Page title={t("rules.newTitle")}>
        <RuleForm initial={initial} ruleId={undefined} />
      </Page>
    );
  }

  return (
    <Page title={t("rules.editTitle")}>
      {existing.data ? (
        <RuleForm initial={toInput(existing.data)} key={existing.data.updatedAt} ruleId={id} />
      ) : existing.isError ? (
        existing.error instanceof ApiRequestError && existing.error.status === 404 ? (
          <Alert variant="warning">
            <AlertDescription>{t("rules.notFound")}</AlertDescription>
          </Alert>
        ) : (
          <ErrorBlock error={existing.error} onRetry={() => void existing.refetch()} />
        )
      ) : (
        <LoadingBlock />
      )}
    </Page>
  );
}
