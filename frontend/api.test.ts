import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchDays,
  fetchMapConfig,
  fetchMonths,
  fetchPhotos,
  fetchPoints,
} from "./api";

const BASE = "/api/addons/photo_diary";
const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function lastCall() {
  const [input, init] = fetchMock.mock.calls.at(-1)!;
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://localhost");
  return {
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers: new Headers(init?.headers),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api: wire shape", () => {
  it("SPEC-PD-001: fetchMonths is a GET of /calendar/months and returns the body", async () => {
    const body = { months: [{ month: "2026-10", count: 3 }], undated_count: 2 };
    reply(body);
    await expect(fetchMonths("family")).resolves.toEqual(body);
    const c = lastCall();
    expect(c.method).toBe("GET");
    expect(c.url.pathname).toBe(`${BASE}/calendar/months`);
  });

  it("SPEC-PD-001: fetchDays sends the month", async () => {
    const body = { days: [{ date: "2026-10-03", count: 5 }] };
    reply(body);
    await expect(fetchDays("family", "2026-10")).resolves.toEqual(body);
    const c = lastCall();
    expect(c.url.pathname).toBe(`${BASE}/calendar/days`);
    expect(c.url.searchParams.get("month")).toBe("2026-10");
  });

  it("SPEC-PD-001: fetchPhotos by date sends date, limit and offset and no undated", async () => {
    const body = { file_ids: ["a", "b"], total: 2 };
    reply(body);
    await expect(fetchPhotos("family", { date: "2026-10-03", limit: 40, offset: 80 })).resolves.toEqual(body);
    const c = lastCall();
    expect(c.url.pathname).toBe(`${BASE}/photos`);
    expect(c.url.searchParams.get("date")).toBe("2026-10-03");
    expect(c.url.searchParams.get("limit")).toBe("40");
    expect(c.url.searchParams.get("offset")).toBe("80");
    expect(c.url.searchParams.has("undated")).toBe(false);
  });

  it("SPEC-PD-001: fetchPhotos undated sends undated=true and no date", async () => {
    reply({ file_ids: [], total: 0 });
    await fetchPhotos("family", { undated: true, limit: 40, offset: 0 });
    const c = lastCall();
    expect(c.url.pathname).toBe(`${BASE}/photos`);
    expect(c.url.searchParams.get("undated")).toBe("true");
    expect(c.url.searchParams.has("date")).toBe(false);
  });

  it("SPEC-PD-002: fetchPoints is a GET of /points", async () => {
    const body = { points: [{ file_id: "a", lat: 35, lon: 139, taken_at: null }] };
    reply(body);
    await expect(fetchPoints("family")).resolves.toEqual(body);
    expect(lastCall().url.pathname).toBe(`${BASE}/points`);
    expect(lastCall().method).toBe("GET");
  });

  it("SPEC-PD-004: fetchMapConfig is a GET of /map-config", async () => {
    const body = { tile_url: "https://t/{z}/{x}/{y}.png", attribution: "" };
    reply(body);
    await expect(fetchMapConfig("family")).resolves.toEqual(body);
    expect(lastCall().url.pathname).toBe(`${BASE}/map-config`);
  });
});

describe("api: drive header", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["fetchMonths", () => fetchMonths("家族 写真/α")],
    ["fetchDays", () => fetchDays("家族 写真/α", "2026-10")],
    ["fetchPhotos", () => fetchPhotos("家族 写真/α", { date: "2026-10-03" })],
    ["fetchPoints", () => fetchPoints("家族 写真/α")],
    ["fetchMapConfig", () => fetchMapConfig("家族 写真/α")],
  ];

  it.each(calls)("SPEC-PD-003 I5: %s sends X-Lit-Drive percent-encoded", async (_name, call) => {
    reply({});
    await call();
    expect(lastCall().headers.get("X-Lit-Drive")).toBe(encodeURIComponent("家族 写真/α"));
  });

  it("SPEC-PD-003 I5: a plain drive name is sent as it is", async () => {
    reply({ points: [] });
    await fetchPoints("family");
    expect(lastCall().headers.get("X-Lit-Drive")).toBe("family");
  });
});

describe("api: errors", () => {
  const all: [string, () => Promise<unknown>][] = [
    ["fetchMonths", () => fetchMonths("family")],
    ["fetchDays", () => fetchDays("family", "2026-10")],
    ["fetchPhotos", () => fetchPhotos("family", { undated: true })],
    ["fetchPoints", () => fetchPoints("family")],
    ["fetchMapConfig", () => fetchMapConfig("family")],
  ];

  it.each(all)("SPEC-PD-003: %s rejects with ApiError carrying a 404", async (_name, call) => {
    reply({ detail: "Not Found" }, 404);
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as ApiError).status).toBe(404);
  });

  it.each([400, 422, 500, 503])("SPEC-PD-003: any non-2xx (%i) is an ApiError with that status", async (status) => {
    reply({ detail: "x" }, status);
    const error = await fetchMonths("family").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  });

  it("SPEC-PD-003: a non-2xx with a body that is not JSON is still an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    const error = await fetchMonths("family").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("SPEC-PD-003: a network failure rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchMonths("family")).rejects.toBeInstanceOf(Error);
  });
});
