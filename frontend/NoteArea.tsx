"use client";

import { memo } from "react";
import Link from "next/link";
import { CircleAlert, FileQuestion, Pen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { LoadError } from "./LoadError";
import type { DayNote } from "./useDayNote";

const ROW = "flex flex-wrap items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2 text-sm";

// React 19 sets a preview's innerHTML again on every render of it, which
// replaces the text under the viewer's selection even when it has not changed.
const NoteText = memo(function NoteText({ source, drive }: { source: string; drive: string }) {
  return <MarkdownPreview source={source} drive={drive} chrome={false} showFrontmatter={false} />;
});

type Props = {
  drive: string;
  note: DayNote;
  /** Whether the core's file page would draw its editor, which write and Edit lead to. */
  editorAvailable: boolean;
};

export function NoteArea({ drive, note, editorAvailable }: Props) {
  const t = useTranslations("photoDiary.note");
  const { info, text, failure, message, busy } = note;
  if (info === null && failure === null) return null;

  const state = info?.state;
  const canEdit = editorAvailable && state === "active" && (text !== null || failure === "stream");
  const canWrite = editorAvailable && (state === "none" || state === "empty");

  return (
    <div className="grid gap-3 pb-4">
      {failure !== null && <LoadError onRetry={note.retry} />}

      {state === "active" && text === null && failure === null && (
        <div className="h-16 animate-pulse rounded-xl bg-bg-elevated" aria-busy="true" />
      )}

      {state === "active" && text !== null && (
        <div className="rounded-xl bg-bg-elevated p-4">
          <NoteText source={text} drive={drive} />
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Link
            href={`/files/${info?.file_id}?edit=1`}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-sand px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-sand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11"
          >
            <Pen size={14} aria-hidden="true" />
            {t("edit")}
          </Link>
        </div>
      )}

      {state === "trashed" && (
        <div className={ROW}>
          <Trash2 size={16} aria-hidden="true" className="text-text-muted" />
          <span className="min-w-0 flex-1">{t("trashed")}</span>
          <Button size="sm" disabled={busy} onClick={note.restore}>
            {t("restore")}
          </Button>
        </div>
      )}

      {state === "missing" && (
        <div className={ROW}>
          <FileQuestion size={16} aria-hidden="true" className="text-text-muted" />
          <span>{t("missing")}</span>
        </div>
      )}

      {(message !== null || canWrite) && (
        <div className="flex flex-wrap items-center gap-3">
          {message !== null && (
            <div className={`${ROW} text-danger`}>
              <CircleAlert size={16} aria-hidden="true" />
              <span>{t(message)}</span>
            </div>
          )}
          {canWrite && (
            <Button disabled={busy} onClick={note.write}>
              <Pen size={14} aria-hidden="true" />
              {t("write")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
