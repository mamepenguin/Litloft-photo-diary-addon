import { createPhotoMap } from "../../frontend/map/createPhotoMap";

(window as unknown as { createPhotoMap: typeof createPhotoMap }).createPhotoMap = createPhotoMap;
