import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errors";
import { keys, queryClient } from "@/lib/queries";

export function SetupPage({ tokenRequired }: { tokenRequired: boolean }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    document.title = `${t("setup.title")} - ${t("app.name")}`;
  }, [t]);

  const setup = useMutation({
    mutationFn: api.setup,
    onSuccess: (status) => queryClient.setQueryData(keys.status, status),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setup.mutate({
      username: username.trim(),
      password,
      setupToken: tokenRequired ? setupToken : undefined,
    });
  }

  const error = mismatch
    ? t("setup.passwordMismatch")
    : setup.isError
      ? message(setup.error)
      : null;

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("setup.title")}</CardTitle>
          <CardDescription>{t("setup.description")}</CardDescription>
        </CardHeader>
        <CardPanel>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {error ? (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel>{t("setup.username")}</FieldLabel>
              <Input
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                maxLength={64}
                onChange={(e) => setUsername(e.target.value)}
                pattern="[\w.\-]+"
                required
                type="text"
                value={username}
              />
              <FieldDescription>{t("setup.usernameHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t("setup.password")}</FieldLabel>
              <Input
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                value={password}
              />
              <FieldDescription>{t("setup.passwordHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t("setup.confirmPassword")}</FieldLabel>
              <Input
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setConfirm(e.target.value)}
                required
                type="password"
                value={confirm}
              />
            </Field>
            {tokenRequired ? (
              <Field>
                <FieldLabel>{t("setup.setupToken")}</FieldLabel>
                <Input
                  autoComplete="off"
                  onChange={(e) => setSetupToken(e.target.value)}
                  required
                  type="password"
                  value={setupToken}
                />
                <FieldDescription>{t("setup.setupTokenHint")}</FieldDescription>
              </Field>
            ) : null}
            <Button loading={setup.isPending} type="submit">
              {t("setup.submit")}
            </Button>
          </form>
        </CardPanel>
      </Card>
    </AuthLayout>
  );
}
