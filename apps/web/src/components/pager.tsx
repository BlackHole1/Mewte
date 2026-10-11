import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pager({ page, pageSize, total, onPageChange }: PagerProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav
      aria-label={t("common.pageOf", { page, pages })}
      className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm"
    >
      <span>{t("common.totalCount", { count: total })}</span>
      <div className="flex items-center gap-2">
        <span>{t("common.pageOf", { page, pages })}</span>
        <Button
          aria-label={t("common.previous")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={t("common.next")}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
