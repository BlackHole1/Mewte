import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toastManager } from "@/components/ui/toast";
import { ApiRequestError } from "./api";

/** Turns any thrown value into a message in the current language. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const code = error instanceof ApiRequestError ? error.code : "unknown";
      return t(`errors.${code}`, { defaultValue: t("errors.unknown") });
    },
    [t],
  );
}

/** Returns a handler that reports a failed mutation as an error toast. */
export function useErrorToast(): (error: unknown) => void {
  const message = useErrorMessage();
  return useCallback(
    (error: unknown) => {
      toastManager.add({ type: "error", title: message(error) });
    },
    [message],
  );
}
