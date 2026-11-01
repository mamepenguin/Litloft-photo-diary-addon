"use client";

import { memo } from "react";
import Link from "next/link";
import { CircleAlert, FileQuestion, Info, Pen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { LoadError } from "./LoadError";
import type { DayNote, NoteMessage } from "./useDayNote";

const ROW = "flex flex-wrap items-center gap-3 rounded-xl bg-bg-elevated px-4 py-3 text-sm";

const MESSAGE_TONE: Record<NoteMessage, { Icon: typeof Info; color: string }> = {
  start: { Icon: CircleAlert, color: "text-danger" },
  restoreFailed: { Icon: CircleAlert, color: "text-danger" },
  rescan: { Icon: Info, color: "text-text-muted" },
};

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

      {state === "active" && (text !== null || canEdit) && (
        <div className="grid gap-2 rounded-xl bg-bg-elevated p-4">
          {text !== null && <NoteText source={text} drive={drive} />}
          {canEdit && (
            <div className="flex justify-end">
              <Link
                href={`/files/${info?.file_id}?edit=1`}
                className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11"
              >
                <Pen size={14} aria-hidden="true" />
                {t("edit")}
              </Link>
            </div>
          )}
        </div>
      )}

      {state === "trashed" && (
        <div className={ROW}>
          <Trash2 size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 text-text-muted">{t("trashed")}</span>
          <Button size="sm" disabled={busy} onClick={note.restore}>
            {t("restore")}
          </Button>
        </div>
      )}

      {state === "missing" && (
        <div className={ROW}>
          <FileQuestion size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="text-text-muted">{t("missing")}</span>
        </div>
      )}

      {canWrite && (
        <Button className="justify-self-start" disabled={busy} onClick={note.write}>
          <Pen size={14} aria-hidden="true" />
          {t("write")}
        </Button>
      )}

      {message !== null && <MessageRow message={message} text={t(message)} />}
    </div>
  );
}

function MessageRow({ message, text }: { message: NoteMessage; text: string }) {
  const { Icon, color } = MESSAGE_TONE[message];
  return (
    <div className={`${ROW} ${color}`}>
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}
