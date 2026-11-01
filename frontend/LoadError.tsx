"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("photoDiary");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-bg-elevated px-4 py-3 text-sm text-danger"
    >
      <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">{t("loadError")}</span>
      <Button size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
