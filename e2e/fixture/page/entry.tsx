import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import coreEn from "@/messages-core/en.json";
import coreJa from "@/messages-core/ja.json";
import en from "../../../frontend/messages/en.json";
import ja from "../../../frontend/messages/ja.json";
import PhotoDiaryPage from "../../../frontend/PhotoDiaryPage";
import { usePathname, useSearchParams } from "./navigation";

// gray-matter, which the core's MarkdownPreview reads frontmatter with, calls
// Buffer.from on a string; the app's bundler supplies Buffer, this one does not.
const scope = globalThis as { Buffer?: { from: (text: string) => Uint8Array } };
scope.Buffer ??= { from: (text) => new TextEncoder().encode(text) };

// A file's own page replaces the diary, as the app's router does: the diary
// unmounts and the document becomes short.
function App() {
  const file = useSearchParams().get("file");
  const editor = usePathname().startsWith("/files/");
  if (editor) return <div id="editor-page" className="h-40 p-4">editor</div>;
  return file === null ? <PhotoDiaryPage /> : <div id="file-page" className="h-40 p-4">{file}</div>;
}

const japanese = window.location.hash === "#ja";
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider
    locale={japanese ? "ja" : "en"}
    messages={japanese ? { ...coreJa, ...ja } : { ...coreEn, ...en }}
  >
    <App />
  </NextIntlClientProvider>,
);
