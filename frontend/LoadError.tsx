"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("photoDiary");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-1 py-3 text-sm">
      <span className="text-danger">{t("loadError")}</span>
      <Button size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
