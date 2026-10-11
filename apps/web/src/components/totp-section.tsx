import type { TotpSetup } from "@mewte/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useErrorMessage, useErrorToast } from "@/lib/errors";
import { keys, queryClient } from "@/lib/queries";
import { CodeInput } from "./code-input";

function refreshTotp() {
  void queryClient.invalidateQueries({ queryKey: keys.totp });
  void queryClient.invalidateQueries({ queryKey: keys.status });
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard access needs HTTPS; the codes stay on screen to copy by hand.
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("totp.recoveryTitle")}</DialogTitle>
        <DialogDescription>{t("totp.recoveryDescription")}</DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </DialogPanel>
      <DialogFooter>
        <Button onClick={() => void copy()} type="button" variant="outline">
          {copied ? t("common.copied") : t("totp.copyCodes")}
        </Button>
        <Button onClick={onDone} type="button">
          {t("totp.done")}
        </Button>
      </DialogFooter>
    </>
  );
}

function SetupDialog({ setup, onClose }: { setup: TotpSetup; onClose: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [code, setCode] = useState("");
  const enable = useMutation({
    mutationFn: () => api.totpEnable(code),
    onSuccess: () => {
      refreshTotp();
      toastManager.add({ type: "success", title: t("totp.enabled") });
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPopup showCloseButton={enable.data === undefined}>
        {enable.data ? (
          <RecoveryCodes codes={enable.data.recoveryCodes} onDone={onClose} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("totp.setupTitle")}</DialogTitle>
            </DialogHeader>
            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                enable.mutate();
              }}
            >
              <DialogPanel className="flex flex-col gap-4">
                {enable.isError ? (
                  <Alert variant="error">
                    <AlertDescription>{message(enable.error)}</AlertDescription>
                  </Alert>
                ) : null}
                <p className="text-sm">{t("totp.setupStep1")}</p>
                {/* A QR code must stay dark-on-light to scan, whatever the theme. */}
                <div className="self-center rounded-lg bg-white p-3">
                  <QRCodeSVG
                    aria-label={t("totp.qrLabel")}
                    role="img"
                    size={176}
                    value={setup.otpauthUrl}
                  />
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">{t("totp.manualEntry")}</span>
                  <code className="break-all rounded-md border bg-muted/40 px-2 py-1 text-xs">
                    {setup.secret}
                  </code>
                </div>
                <p className="text-sm">{t("totp.setupStep2")}</p>
                <div className="flex justify-center">
                  <CodeInput onChange={setCode} value={code} />
                </div>
              </DialogPanel>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="ghost" />}>
                  {t("common.cancel")}
                </DialogClose>
                <Button disabled={code.length !== 6} loading={enable.isPending} type="submit">
                  {t("totp.verify")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

type PasswordAction = "disable" | "regenerate";

function PasswordDialog({ action, onClose }: { action: PasswordAction; onClose: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const confirm = useMutation({
    mutationFn: async () => {
      if (action === "disable") {
        await api.totpDisable(password);
        return null;
      }
      return (await api.totpRecoveryCodes(password)).recoveryCodes;
    },
    onSuccess: (result) => {
      refreshTotp();
      if (result) {
        setCodes(result);
      } else {
        toastManager.add({ type: "success", title: t("totp.disabled") });
        onClose();
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate();
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPopup showCloseButton={codes === null}>
        {codes ? (
          <RecoveryCodes codes={codes} onDone={onClose} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t(`totp.${action}Title`)}</DialogTitle>
              <DialogDescription>{t(`totp.${action}Description`)}</DialogDescription>
            </DialogHeader>
            <form className="contents" onSubmit={submit}>
              <DialogPanel className="flex flex-col gap-4">
                {confirm.isError ? (
                  <Alert variant="error">
                    <AlertDescription>{message(confirm.error)}</AlertDescription>
                  </Alert>
                ) : null}
                <Field>
                  <FieldLabel>{t("totp.password")}</FieldLabel>
                  <Input
                    autoComplete="current-password"
                    autoFocus
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </Field>
              </DialogPanel>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="ghost" />}>
                  {t("common.cancel")}
                </DialogClose>
                <Button
                  loading={confirm.isPending}
                  type="submit"
                  variant={action === "disable" ? "destructive" : "default"}
                >
                  {action === "disable" ? t("totp.disable") : t("totp.regenerate")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

export function TotpSection() {
  const { t } = useTranslation();
  const onError = useErrorToast();
  const totp = useQuery({ queryKey: keys.totp, queryFn: api.totpStatus });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [action, setAction] = useState<PasswordAction | null>(null);
  const start = useMutation({ mutationFn: api.totpSetup, onError, onSuccess: setSetup });
  const enabled = totp.data?.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("totp.title")}
          {totp.data ? (
            <Badge variant={enabled ? "success" : "outline"}>
              {enabled ? t("totp.statusOn") : t("totp.statusOff")}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{t("totp.description")}</CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        {enabled ? (
          <>
            <p className="text-muted-foreground text-sm">
              {t("totp.recoveryLeft", { count: totp.data?.recoveryCodesLeft ?? 0 })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAction("regenerate")} type="button" variant="outline">
                {t("totp.regenerate")}
              </Button>
              <Button
                onClick={() => setAction("disable")}
                type="button"
                variant="destructive-outline"
              >
                {t("totp.disable")}
              </Button>
            </div>
          </>
        ) : (
          <Button
            className="self-start"
            disabled={totp.data === undefined}
            loading={start.isPending}
            onClick={() => start.mutate()}
            type="button"
          >
            {t("totp.enable")}
          </Button>
        )}
      </CardPanel>

      {setup ? <SetupDialog onClose={() => setSetup(null)} setup={setup} /> : null}
      {action ? (
        <PasswordDialog action={action} key={action} onClose={() => setAction(null)} />
      ) : null}
    </Card>
  );
}
