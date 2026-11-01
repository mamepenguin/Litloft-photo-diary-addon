# Review: 7237d2d and e610a8d at 3bfc3e6

No defect in the product code. All four findings are gaps in the tests.

Everything was run on a `git archive` of 3bfc3e6 in the scratchpad; the repository was not touched. Two ways of measuring:

- **Specs:** the repo's Playwright specs, with mutations applied to the copy.
- **Real server:** a small Node server sending the route's `Cache-Control: public, max-age=31536000, immutable`, with no `page.route`. Playwright routing turns the browser's HTTP cache off, so the specs cannot show cache behaviour. "Labels" means the cluster's count label appeared, which needs a running worker.

## Answers

**Does a first successful load stay on the bare, immutable URLs? Yes.**
Server hits on a clean load were `ml.js`, `ml-worker.js`, each once. The second map made no asset request. After a reload there were none either. The worker's single hit shows that `new Worker` started from the cache filled by the fetch.

**Does the worker the map uses come from the URL that was checked? Yes.**
`workerUrl` is computed once (`createPhotoMap.ts:123`) and passed to both `fetchWorker` and `setWorkerUrl`. MapLibre uses it unchanged for a same-origin URL (`new Worker(e,{type:"module"})`). Its `.cjs` test strips the query, so `?retry=N` does not change the worker type. After one 503 the hits were `ml.js?retry=1`, `ml-worker.js?retry=1`, with no further worker request, and labels appeared.

**Can one failed attempt leave a later map unable to recover? No.**
- The `.catch` is the only place that clears `library` and bumps `failures`. Only one attempt can be in flight, so a late rejection cannot overwrite a newer attempt. `Promise.all` also absorbs a second rejection.
- Measured recoveries: worker 503 once, worker 503 three times (`retry=1`, `2`, `3`, then drawn), library 503 once, both 503 once.
- A connection reset was retried by Chromium itself and drew the map.
- While the worker kept answering 503, each `create` rejected, so the user gets the load error and its retry rather than a blank map.
- `MapView` reaches `libFailed` with a retry, and `retryLoad` returns to `creating` with a new host.

**Can one failed attempt make every later map re-download? No.**
- After the retry succeeds, later maps made no asset request.
- A reload returns to the bare URLs and downloads only what the bare URL does not yet hold: `ml-worker.js` after a worker failure, `ml.js` after a library failure, both after both failed. A reload after that was not measured; the clean-load run shows a cached bare URL makes no request.
- A failed attempt does repeat the file that had succeeded (the library, 1.1 MB, under `?retry=1`), once per failure. That is expected and harmless on a LAN.

**Does `e2e/workerRetry.spec.ts` fail without the fix? Yes.**
With the pre-fix `loadLibrary` it fails at line 37 (`create()` returned `created`). It also kills: never using the bare URL, checking the bare URL on a retry, not clearing `library`, and not counting failures. It passed 30 of 30 runs with `--repeat-each=30`. Its gaps are findings 1 and 2.

**Does the test in `e2e/tileFailure.spec.ts` really bound requests? Partly.**
- At the pinned code the delta was 0 in the window, 33 requests in total.
- It catches a request per idle: mutation delta 3932 against the limit of 30.
- It catches a re-request every 2 s: delta 48.
- It does not catch a slower repeat. See finding 3.

## Findings

### 1. The worker spec never exercises a non-OK status

- **File:** `e2e/workerRetry.spec.ts:8` (`route.abort()` only); the untested line is `frontend/map/createPhotoMap.ts:115`.
- **What happens:** deleting the `!response.ok` check leaves `workerRetry` and `libraryRetry` green. On the real server with that mutation, a worker answering 503 gave `created`, no labels and no error, on the first and on the second map. That is the silent blank map this commit exists to remove, and it would return unnoticed. I ran only these two specs against this mutation, not the whole suite, but no other spec fails the worker request with a status.
- **Condition in ordinary use:** the backend is down or restarting (`docker compose up`) while a browser with no cached copy opens the map. A status from the proxy is the likely form of this failure on a LAN, more likely than a dropped connection.
- **Frequency:** 1
- **Impact:** 8

### 2. The worker spec's final assertion does not show the retried worker runs

- **File:** `e2e/workerRetry.spec.ts:47-48`.
- **What happens:** the spec ends on `created` and a visible canvas, and both hold with no working worker. Removing `setWorkerUrl` entirely leaves this spec green. Other specs kill that mutation only on the bare URL (`mutation-r1.md` X20), so no spec shows a map drawing its points from a `?retry=N` worker. A defect limited to the retry URL would pass CI and draw a blank map after a retry.
- **Related mutation:** checking `?retry=N` but starting the bare URL also survives. On the real server that one is harmless, because the map still draws from a second worker request to the bare URL. It is noted only because the spec cannot tell the URLs apart.
- **Condition in ordinary use:** a retry after a failed load, combined with a later change that breaks the query-string path.
- **Frequency:** 1
- **Impact:** 8

### 3. The tile bound allows one full re-request per window, so slow repeats pass

- **File:** `e2e/tileFailure.spec.ts:61`.
- **What happens:** one round is 24 tiles in this viewport and the limit is 30 over 5 s, while the pinned code's delta is 0. A mutation that re-requests the tiles in view every 4 s while the notice is up passes, with delta 24. Such a defect would keep hitting the tile server, a volunteer service with a usage policy, for as long as the notice is up.
- **Condition in ordinary use:** the tile server is failing while a map stays open, combined with a later change that adds a timed retry.
- **Frequency:** 1
- **Impact:** 3

### 4. Nothing pins that a later map skips the worker fetch

- **File:** `e2e/libraryRetry.spec.ts:45-47`.
- **What happens:** setting `library = null` after success (so nothing is kept) leaves both specs green. A repeat `import()` is answered from the module map with no request, and the count only looks at the library, so the assertion at line 47 still holds. The worker would be fetched again for every map. I did not measure that mutation on the real server; the immutable header should answer those fetches from the cache, so the cost should be close to nothing.
- **Condition in ordinary use:** every map opened, if this regressed.
- **Frequency:** 8
- **Impact:** 1

## Noted, not findings

- Removing `await response.arrayBuffer()` also survives. With no condition shown in ordinary use (frequency 0), it is not scored.
- A `Worker` that fails after a good fetch would still be silent, but the cache hit makes this frequency 0. The bundled MapLibre does have a listener that fires "Worker failed to load" on worker `error` (`Qc`). I did not measure whether that event reaches the map's `error` listeners.

TOTAL: 4 findings
