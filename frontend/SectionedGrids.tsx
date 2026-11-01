"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileGrid } from "@/components/FileGrid";
import type { FileItem } from "@/types";
import { formatListDate } from "./lib/dates";
import { buildPageQuery } from "./lib/pageUrl";
import type { Section } from "./lib/sections";

type Props = {
  sections: Section[];
  /** Whatever has been loaded so far, in the order of the sections' ids. */
  files: FileItem[];
  moreMayFollow: boolean;
  onRefresh: () => void;
};

export function SectionedGrids({ sections, files, moreMayFollow, onRefresh }: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const pathname = usePathname();

  const byId = new Map(files.map((file) => [file.id, file]));
  const shown = sections
    .map((section) => ({
      section,
      files: section.fileIds.flatMap((id) => {
        const file = byId.get(id);
        return file ? [file] : [];
      }),
    }))
    .filter((entry) => entry.files.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {shown.map(({ section, files: sectionFiles }, index) => (
        <section key={section.date ?? "undated"} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            {section.date ? (
              <Link
                href={`${pathname}${buildPageQuery({ month: section.date.slice(0, 7), date: section.date })}`}
                className="underline-offset-2 hover:text-accent hover:underline"
              >
                {formatListDate(section.date, locale)}
              </Link>
            ) : (
              t("undated")
            )}
            <span className="ml-2 font-normal text-text-muted">
              {t("list.headingCount", { count: section.count })}
            </span>
          </h3>
          <FileGrid
            files={sectionFiles}
            moreMayFollow={moreMayFollow && index === shown.length - 1}
            onRefresh={onRefresh}
          />
        </section>
      ))}
    </div>
  );
}
