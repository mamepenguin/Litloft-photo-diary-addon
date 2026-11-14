import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import coreEn from "@/messages-core/en.json";
import coreJa from "@/messages-core/ja.json";
import en from "../../../frontend/messages/en.json";
import ja from "../../../frontend/messages/ja.json";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { PageFrame } from "@/components/PageFrame";
import { PhotoShelf } from "../../../frontend/PhotoShelf";
import type { FileItem } from "@/types";

// The Library's shelf over the core's justified grid, at the width the Library
// gives it. The photos are fixed so a line's edge can be measured; everything
// drawing them is the addon's and the core's own.

type Photo = [id: string, width: number, height: number];

const photo = ([id, width, height]: Photo): FileItem => ({
  id,
  filename: `${id}.jpg`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1,
  duration: null,
  image_width: width,
  image_height: height,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2024-12-01T00:00:00",
  updated_at: "2024-12-01T00:00:00",
});

const mixed: Photo[] = [
  ["m01", 2400, 1800],
  ["m02", 1500, 2000],
  ["m03", 2800, 2000],
  ["m04", 1600, 2400],
  ["m05", 2000, 2000],
  ["m06", 1920, 1080],
  ["m07", 1080, 1920],
  ["m08", 2500, 2000],
  ["m09", 1600, 2000],
  ["m10", 3000, 2000],
  ["m11", 1500, 2000],
  ["m12", 2400, 1800],
];

const SHELVES: { key: string; photos: Photo[] }[] = [
  { key: "2024-12", photos: mixed },
  { key: "2024-11", photos: mixed.map(([id, w, h]) => [`n${id.slice(1)}`, w, h] as Photo) },
  {
    key: "2024-10",
    photos: [
      ["s01", 1400, 2000],
      ["s02", 1400, 2000],
    ],
  },
];

function App() {
  const files = new Map(
    SHELVES.flatMap((shelf) => shelf.photos.map((entry) => [entry[0], photo(entry)])),
  );
  return (
    <PageFrame width="wide" header={<div className="h-14" />}>
      <ClipboardProvider>
        <div className="space-y-6 px-4 pb-6 pt-4">
          <div className="space-y-9 sm:space-y-10">
            {SHELVES.map((shelf) => (
              <PhotoShelf
                key={shelf.key}
                shelf={{
                  key: shelf.key,
                  label: "",
                  count: shelf.photos.length,
                  file_ids: shelf.photos.map(([id]) => id),
                }}
                files={files}
                drive="main"
                by="month"
                sort="newest"
                pathname="/drive/main/addons/photo_diary"
                onRefresh={() => {}}
                onSeeAll={() => {}}
              />
            ))}
          </div>
        </div>
      </ClipboardProvider>
    </PageFrame>
  );
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
