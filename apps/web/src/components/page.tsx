import type { UseQueryResult } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/errors";

interface PageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Standard page frame: a heading row with optional actions, then the content. */
export function Page({ title, description, actions, children }: PageProps) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${title} - ${t("app.name")}`;
  }, [title, t]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading font-semibold text-xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function LoadingBlock() {
  const { t } = useTranslation();
  return (
    <div aria-label={t("common.loading")} className="flex justify-center py-16" role="status">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <Alert variant="error">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{t("common.loadFailed")}</AlertTitle>
      <AlertDescription>{message(error)}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button onClick={onRetry} size="xs" type="button" variant="outline">
            {t("common.retry")}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** Renders a query's loading and error states, and its data once there is some. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingBlock />;
}
