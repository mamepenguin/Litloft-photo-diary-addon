import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import coreEn from "@/messages-core/en.json";
import coreJa from "@/messages-core/ja.json";
import en from "../../../frontend/messages/en.json";
import ja from "../../../frontend/messages/ja.json";
import PhotoDiaryPage from "../../../frontend/PhotoDiaryPage";
import { useSearchParams } from "./navigation";

// A file's own page replaces the diary, as the app's router does: the diary
// unmounts and the document becomes short.
function App() {
  const file = useSearchParams().get("file");
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
