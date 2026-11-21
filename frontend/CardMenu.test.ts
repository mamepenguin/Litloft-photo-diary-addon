/**
 * Acceptance tests for docs/specs/card-menu.md (SPEC-PD-026): every core
 * `FileGrid` Photo Diary draws opts in to the app card menu and keeps its
 * `onRefresh`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FRONTEND = dirname(realpathSync(fileURLToPath(import.meta.url)));

const GRID_FILES = [
  "CalendarView.tsx",
  "LibraryFace.tsx",
  "PhotoShelf.tsx",
  "SectionedGrids.tsx",
  "ShelfPage.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(path);
    }
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

interface Attribute {
  name: string;
  value: string | null;
}

/** The attributes of each `<FileGrid` opening tag in `source`, in order. */
function fileGridTags(source: string): Attribute[][] {
  const tags: Attribute[][] = [];
  const start = /<FileGrid(?![\w$.])/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source)) !== null) {
    tags.push(readAttributes(source, match.index + match[0].length));
  }
  return tags;
}

function readBraced(source: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("unterminated brace in a FileGrid tag");
}

function readAttributes(source: string, from: number): Attribute[] {
  const attributes: Attribute[] = [];
  let i = from;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === ">" || (c === "/" && source[i + 1] === ">")) {
      return attributes;
    } else if (c === "{") {
      const end = readBraced(source, i);
      attributes.push({ name: "{spread}", value: source.slice(i, end) });
      i = end;
    } else {
      const name = /^[A-Za-z_$][\w$-]*/.exec(source.slice(i));
      if (!name) throw new Error(`unexpected ${JSON.stringify(c)} in a FileGrid tag`);
      i += name[0].length;
      while (/\s/.test(source[i])) i++;
      if (source[i] !== "=") {
        attributes.push({ name: name[0], value: null });
        continue;
      }
      i++;
      while (/\s/.test(source[i])) i++;
      let end: number;
      if (source[i] === "{") end = readBraced(source, i);
      else if (source[i] === '"' || source[i] === "'") end = source.indexOf(source[i], i + 1) + 1;
      else throw new Error(`unexpected value for ${name[0]} in a FileGrid tag`);
      attributes.push({ name: name[0], value: source.slice(i, end) });
      i = end;
    }
  }
  throw new Error("unterminated FileGrid tag");
}

function optsIn(tag: Attribute[]): boolean {
  const menu = tag.filter((a) => a.name === "appCardMenu");
  return menu.length === 1 && (menu[0].value === null || /^\{\s*true\s*\}$/.test(menu[0].value));
}

function passesOnRefresh(tag: Attribute[]): boolean {
  return tag.some((a) => a.name === "onRefresh" && a.value !== null);
}

const grids = sourceFiles(FRONTEND)
  .map((path) => ({
    file: relative(FRONTEND, path).split(sep).join("/"),
    tags: fileGridTags(readFileSync(path, "utf8")),
  }))
  .filter(({ tags }) => tags.length > 0);

describe("SPEC-PD-026 the enumeration of FileGrid elements", () => {
  it("SPEC-PD-026 I1 detector: a bare appCardMenu or appCardMenu={true} opts in; any other form or none does not", () => {
    const cases: [string, boolean][] = [
      ["<FileGrid files={f} appCardMenu onRefresh={r} />", true],
      ["<FileGrid files={f} onRefresh={r} appCardMenu/>", true],
      ["<FileGrid\n  files={f}\n  appCardMenu={true}\n  onRefresh={() => (a > b ? r() : null)}\n/>", true],
      ["<FileGrid files={f} onRefresh={r} />", false],
      ["<FileGrid files={f} appCardMenu={false} onRefresh={r} />", false],
      ["<FileGrid files={f} appCardMenu={on} onRefresh={r} />", false],
      ['<FileGrid files={f} appCardMenu="true" onRefresh={r} />', false],
      ["<FileGrid files={f} {...{ appCardMenu: true }} onRefresh={r} />", false],
      ["<FileGrid files={f} data-appCardMenu onRefresh={r} />", false],
    ];
    for (const [source, expected] of cases) {
      const tags = fileGridTags(source);
      expect(tags, source).toHaveLength(1);
      expect(optsIn(tags[0]), source).toBe(expected);
    }
  });

  it("SPEC-PD-026 I2 detector: onRefresh counts only when passed a value", () => {
    expect(passesOnRefresh(fileGridTags("<FileGrid files={f} onRefresh={r} />")[0])).toBe(true);
    expect(passesOnRefresh(fileGridTags("<FileGrid files={f} appCardMenu />")[0])).toBe(false);
    expect(passesOnRefresh(fileGridTags("<FileGrid files={f} onRefresh />")[0])).toBe(false);
  });

  it("SPEC-PD-026 I1 the FileGrid elements are in exactly the five grid files", () => {
    expect(grids.map((g) => g.file).sort()).toEqual(GRID_FILES);
  });
});

describe("SPEC-PD-026 every photo grid opts in to the app card menu", () => {
  it.each(GRID_FILES)("SPEC-PD-026 I1 %s passes appCardMenu on every FileGrid", (file) => {
    const grid = grids.find((g) => g.file === file);
    expect(grid, `${file} draws no FileGrid`).toBeDefined();
    grid!.tags.forEach((tag, n) => {
      expect(optsIn(tag), `${file} FileGrid #${n + 1}: ${JSON.stringify(tag)}`).toBe(true);
    });
  });

  it.each(GRID_FILES)("SPEC-PD-026 I2 %s still passes onRefresh on every FileGrid", (file) => {
    const grid = grids.find((g) => g.file === file);
    expect(grid, `${file} draws no FileGrid`).toBeDefined();
    grid!.tags.forEach((tag, n) => {
      expect(passesOnRefresh(tag), `${file} FileGrid #${n + 1}: ${JSON.stringify(tag)}`).toBe(true);
    });
  });
});
