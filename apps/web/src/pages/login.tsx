import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { CodeInput } from "@/components/code-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiRequestError, api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errors";
import { keys, queryClient } from "@/lib/queries";

type Step = "password" | "totp" | "recovery";

export function LoginPage() {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [step, setStep] = useState<Step>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    document.title = `${t("login.title")} - ${t("app.name")}`;
  }, [t]);

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (status) => {
      // Keep the status query itself: clearing the cache would detach the app's observer from it.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.status[0] });
      queryClient.setQueryData(keys.status, status);
    },
    onError: (error) => {
      // The password was right; the server now wants the second factor.
      if (error instanceof ApiRequestError && error.code === "totp_required") {
        setStep("totp");
        login.reset();
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({
      username: username.trim(),
      password,
      code: step === "password" ? undefined : code.trim(),
    });
  }

  function switchTo(next: Step) {
    setCode("");
    login.reset();
    setStep(next);
  }

  const error = login.isError ? message(login.error) : null;

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{step === "password" ? t("login.title") : t("login.codeTitle")}</CardTitle>
          {step === "totp" ? <CardDescription>{t("login.codeDescription")}</CardDescription> : null}
          {step === "recovery" ? (
            <CardDescription>{t("login.recoveryDescription")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardPanel>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {error ? (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {step === "password" ? (
              <>
                <Field>
                  <FieldLabel>{t("login.username")}</FieldLabel>
                  <Input
                    autoCapitalize="none"
                    autoComplete="username"
                    autoFocus
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    type="text"
                    value={username}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("login.password")}</FieldLabel>
                  <Input
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </Field>
                <Button loading={login.isPending} type="submit">
                  {t("login.submit")}
                </Button>
              </>
            ) : null}

            {step === "totp" ? (
              <>
                <div className="flex justify-center">
                  <CodeInput autoFocus onChange={setCode} value={code} />
                </div>
                <Button disabled={code.length !== 6} loading={login.isPending} type="submit">
                  {t("login.verify")}
                </Button>
                <Button onClick={() => switchTo("recovery")} type="button" variant="link">
                  {t("login.useRecoveryCode")}
                </Button>
              </>
            ) : null}

            {step === "recovery" ? (
              <>
                <Field>
                  <FieldLabel>{t("login.recoveryCode")}</FieldLabel>
                  <Input
                    autoCapitalize="none"
                    autoComplete="off"
                    autoFocus
                    onChange={(e) => setCode(e.target.value)}
                    required
                    spellCheck={false}
                    type="text"
                    value={code}
                  />
                </Field>
                <Button loading={login.isPending} type="submit">
                  {t("login.verify")}
                </Button>
                <Button onClick={() => switchTo("totp")} type="button" variant="link">
                  {t("login.useAuthenticator")}
                </Button>
              </>
            ) : null}

            {step !== "password" ? (
              <Button onClick={() => switchTo("password")} type="button" variant="ghost">
                {t("common.back")}
              </Button>
            ) : null}
          </form>
        </CardPanel>
      </Card>
    </AuthLayout>
  );
}
