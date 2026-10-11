import { MAX_RETENTION_DAYS } from "@mewte/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Page } from "@/components/page";
import { LanguageSelect, ThemeSelect } from "@/components/preferences";
import { TotpSection } from "@/components/totp-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
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
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errors";
import { keys, queryClient } from "@/lib/queries";

function RetentionSection() {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const settings = useQuery({ queryKey: keys.settings, queryFn: api.settings });
  const [draft, setDraft] = useState<number | null>(null);
  const days = draft ?? settings.data?.retentionDays ?? 0;

  const save = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings, saved);
      setDraft(null);
      toastManager.add({ type: "success", title: t("settings.retentionSaved") });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.retentionTitle")}</CardTitle>
        <CardDescription>{t("settings.retentionDescription")}</CardDescription>
      </CardHeader>
      <CardPanel>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ retentionDays: days });
          }}
        >
          {save.isError ? (
            <Alert variant="error">
              <AlertDescription>{message(save.error)}</AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <FieldLabel>{t("settings.retentionDays")}</FieldLabel>
            <div className="flex items-center gap-2">
              <NumberField
                className="w-36"
                disabled={settings.data === undefined}
                max={MAX_RETENTION_DAYS}
                min={0}
                onValueChange={(value) => setDraft(value ?? 0)}
                value={days}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement aria-label={t("common.decrease")} />
                  <NumberFieldInput />
                  <NumberFieldIncrement aria-label={t("common.increase")} />
                </NumberFieldGroup>
              </NumberField>
              <span className="text-muted-foreground text-sm">{t("common.daysUnit")}</span>
            </div>
            <FieldDescription>{t("settings.retentionHint")}</FieldDescription>
          </Field>
          <Button
            className="self-start"
            disabled={draft === null}
            loading={save.isPending}
            type="submit"
          >
            {t("common.save")}
          </Button>
        </form>
      </CardPanel>
    </Card>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const languageId = useId();
  const themeId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearanceTitle")}</CardTitle>
        <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={languageId}>{t("language.label")}</Label>
          <LanguageSelect id={languageId} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={themeId}>{t("theme.label")}</Label>
          <ThemeSelect id={themeId} />
        </div>
      </CardPanel>
    </Card>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const change = useMutation({
    mutationFn: api.changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toastManager.add({ type: "success", title: t("settings.passwordChanged") });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword, newPassword });
  }

  const error = mismatch
    ? t("setup.passwordMismatch")
    : change.isError
      ? message(change.error)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.passwordTitle")}</CardTitle>
        <CardDescription>{t("settings.passwordDescription")}</CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="flex max-w-sm flex-col gap-4" onSubmit={submit}>
          {error ? (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <FieldLabel>{t("settings.currentPassword")}</FieldLabel>
            <Input
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </Field>
          <Field>
            <FieldLabel>{t("settings.newPassword")}</FieldLabel>
            <Input
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              type="password"
              value={newPassword}
            />
            <FieldDescription>{t("setup.passwordHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("settings.confirmNewPassword")}</FieldLabel>
            <Input
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setConfirm(e.target.value)}
              required
              type="password"
              value={confirm}
            />
          </Field>
          <Button className="self-start" loading={change.isPending} type="submit">
            {t("settings.changePassword")}
          </Button>
        </form>
      </CardPanel>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <Page title={t("settings.title")}>
      <div className="flex max-w-3xl flex-col gap-6">
        <RetentionSection />
        <AppearanceSection />
        <PasswordSection />
        <TotpSection />
      </div>
    </Page>
  );
}
