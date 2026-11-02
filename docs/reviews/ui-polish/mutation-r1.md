# Mutation review r1: UI polish

- 固定コミット: `5655ce277c2a9bca56f1bda92af0735870361e5d`（`feature/ui-polish`、addon リポジトリ）
- 実行: 変異 477 件（キル 329、生存 148）。対照の未変異 6 回はすべて通過
- ベースライン: vitest 488 件、e2e 145 件、backend 207 件がすべて通過
- ツリー: 変異は作業用コピーの w1〜w3 だけに入れ、1 件ごとに元の内容へ書き戻した。終了時に w1〜w3 を削除し、残したコピーが基準のエクスポートと `diff -rq` で一致することを確認した

## 手順と逸脱

- **`git archive` は自分で実行していない。** このエージェントのワークツリー分離により、addon リポジトリを対象にした git コマンドが拒否された。代わりに、並行レビューが同じスクラッチパッドに置いた `cr/addon` をコピーして使った。根拠は 2 点: addon の `refs/heads/feature/ui-polish` が固定 SHA を指すこと、`cr/addon` と addon の作業ツリーの `diff -rq` の差がビルド生成物 3 件（`e2e/fixture/bundle.js`、`page.js`、`page.css`）だけであること。`cr/addon` の出どころ自体は確かめていない
- **`main` との差分は見ていない。** 同じ理由。「変更部分」は spec の Touch points と読解で判断した。`PhotoList.tsx`、`MapView.tsx`、`PhotoDiaryPage.tsx`、`router.py` では変更前からある行に変異を入れた可能性がある
- **createPhotoMap.ts は vitest を省略した。** vitest ではすべてスタンドインに置き換わるので、e2e だけで判定した
- **backend はファイルを絞った。** 変異ごとの実行は `test_map_config_and_assets.py`（26 件）のみ。未変異の全件は 207 件通過
- 判定の順序は vitest（`--bail=1 --retry=1`）、生存したら e2e（`--retries=1`）。一度目に並列負荷の下で無関係に見える失敗が出たので、やり直して再試行と未変異の対照 6 回を入れた。対照はすべて通過

## ファイル別

| ファイル | 変異 | キル | 生存 |
|---|---|---|---|
| frontend/map/createPhotoMap.ts | 153 | 89 | 64 |
| frontend/map/mapStyle.ts | 46 | 43 | 3 |
| frontend/CalendarView.tsx | 43 | 33 | 10 |
| frontend/WeekStrip.tsx | 17 | 12 | 5 |
| frontend/usePinned.ts | 28 | 9 | 19 |
| frontend/useDayPreview.ts | 30 | 23 | 7 |
| frontend/DayCell.tsx | 33 | 23 | 10 |
| frontend/DayPreview.tsx | 25 | 18 | 7 |
| frontend/MonthGrid.tsx | 29 | 23 | 6 |
| frontend/lib/steps.ts | 8 | 8 | 0 |
| frontend/lib/dates.ts | 7 | 5 | 2 |
| frontend/PhotoList.tsx | 15 | 10 | 5 |
| frontend/MapView.tsx | 25 | 20 | 5 |
| frontend/PhotoDiaryPage.tsx | 11 | 7 | 4 |
| backend/router.py | 7 | 6 | 1 |

## 全体に関わる発見: 3 つの検査が効いていない

1. **200 ms の待ちがスクロールイベントより短い。** テスト「I6 (revised): the strip engages when the heading reaches it」（`calendarPolish.spec.ts:598`）は 200 ms 待って strip が無いことを確かめる。この環境では `scrollTo` のあと 150 ms で読むと strip の状態が 1 段遅れ、1200 ms で正しくなった。p021（しきい値 +200 px）と w002 は、待ちを 1500 ms にすると落ちる。否定の検査が、まだ反応していない画面を見て通っている
2. **「scrolling ends it」は pointerleave に助けられている。** `calendarPolish.spec.ts:341` は、スクロールでセルがポインタの下から動いて leave が出るので、scroll の listener を外しても通る（d028）。保持されたカラムの上ではセルが動かないので、そこでは救いがない
3. **スタンドインが本番の形と違う。** フィクスチャの `FileGrid` のタイルは `position` を持たないが、core の `FileCard` は `relative`。c029 はここで生存する。`pagePolish.spec.ts:215` は app header なしで走るので `calc(0px + 0px)` が `0px` になり、l012 を見分けられない

## Findings

P と M と N はスクラッチのプローブ（未変異で通り、変異で落ちることを確認した。削除済み）。F と I は依頼の尺度。

| # | 場所 | 変異 | 普段の操作で起きる条件と、起きること | F | I | 不変条件 | 確認 |
|---|---|---|---|---|---|---|---|
| D1 | map/createPhotoMap.ts:452 | **変異なしで spec に反する。** `!loaded` が止めている | 地図を開いてタイルが返るまで pin が 1 個も出ない。タイルを保留すると未変異で 8 秒後も pin 0。`load` はタイルを待つ。`!loaded` だけ除いた m087 では同じ条件で pin が出て、既存スイートも通る | 8 | 3 | spec 5 節「the land colour shows first and pins are not held back」 | M08 |
| 1 | map/createPhotoMap.ts:565 | m131 `map.on("render", placePins)` を除去 | 地図をドラッグやズームするたび、残る pin が元の画面位置に留まり、写真の場所と違う所を指す。「panning keeps a pin」は同一性だけを見ている | 10 | 8 | I9、SPEC-PD-011 | M01 |
| 2 | WeekStrip.tsx:49 | w006 `day` を月の数に | strip を出すたび、セルの数字が日付でなく月になる。data-date と名前は正しいのでテストに映らない | 8 | 8 | I6 | P06 |
| 3 | DayCell.tsx:75 | e024 `border-accent` を除去 | 日を開くたび、選択中の日に枠が出ない。`aria-pressed` しか見ていない | 8 | 3 | spec 9 節 Calendar cell | P05 |
| 4 | DayCell.tsx:87 | e028 `count > 0` -> `count > 1` | 写真 1 枚の日の枚数が出ない。テストの数値は 2 から | 8 | 3 | spec 9 節「The count stays」、10 節「the count remains」 | P04 |
| 5 | WeekStrip.tsx:36 | w013 `bg-bg-primary` を除去 | strip を出すたび背景が透け、下を流れる写真の上に日付が重なる | 8 | 3 | spec 9 節 Strip | P07 |
| 6 | CalendarView.tsx:360 | c029 `z-20` を除去 | core の `FileCard` は `relative` なので、流れる写真が strip の上に出て strip を押せない。フィクスチャでは再現せず、タイルに `position:relative` を足すと落ちる | 8 | 5 | I6 | P14 |
| 7 | usePinned.ts:64、WeekStrip.tsx:18 | p021 しきい値 +200、w002 `STRIP_REACH = STRIP_HEIGHT` | 一覧が見出しに届く前に strip が出て、月グリッドを早く隠す。上の発見 1 で検査が効かない | 8 | 3 | I6 の改訂 | P01 |
| 8 | CalendarView.tsx:215 | c017 `- appHeaderHeight()` を除去 | strip で日を押すたび、一覧の先頭が header の高さ分（56 px）だけ見出しの下に隠れる。見出しは sticky で同じ位置に見えるのでテストが通る | 5 | 3 | spec 1 節 SPEC-PD-009 | P02 |
| 9 | CalendarView.tsx:214 | c015 `scrollOnSettle.current = null` を除去 | strip で押した日へ、あとでグリッドから戻ると、頼んでいないのにスクロールする | 3 | 3 | spec 1 節（スクロールは strip の押下だけ） | P03 |
| 10 | usePinned.ts:38 | p013 window の resize listener を除去 | 画面に出したままウィンドウの高さを縮めると、カラムが保持されたままで下の週に届かなくなる。既存のテストは hidden の間の縮小と column 自身の変化だけ | 3 | 5 | I5 | P09 |
| 11 | usePinned.ts:27、:11 | p008 header を足さない、p009 と p003 gap を足さない | viewport が column + 16〜72 px の帯のとき、保持されて最後の週の下端が切れる。既存の I5 のテストは帯から遠い高さだけ | 1 | 3 | I5 | P10 |
| 12 | useDayPreview.ts:101 | d028 scroll listener を除去 | 保持されたカラムの日で preview を出したままホイールでスクロールすると残る | 5 | 1 | spec 3 節 Preview | P11 |
| 13 | DayPreview.tsx:11 | v005 右と下の clamp を除去 | hover できる狭い画面で右端の列の日。preview が画面外へはみ出す。テストは左端だけ | 3 | 1 | spec 1 節 | P12 |
| 14 | map/createPhotoMap.ts:460 | m093 下側の判定を除去 | 表示より下の読み込み済みタイルの pin が残り、余分に thumbnail を読む。既存のテストはタイルの境界の位置で偶然通る。緯度をずらすと落ちる | 8 | 1 | I10 | M02 |
| 15 | map/createPhotoMap.ts:24 | m002 `PIN_MARGIN = 0` | パンすると端の pin が半分見える前に消える。テストは上限しか見ていない | 8 | 1 | I10、spec 10 節 | M02 |
| 16 | map/createPhotoMap.ts:361、:425 | m057 ガード除去、m072 記録除去 | 失敗した写真の pin をパンで外して戻すと、また読みに行く。テストのコメントは同じ趣旨だが、実際は setPoints を呼んでいて正当に再要求される経路 | 1 | 1 | spec 2 節「not requested again until the map's data refreshes」 | M03 |
| 17 | map/createPhotoMap.ts:586、:362 | m140 再読込を除去、m058 display を戻さない | サムネイルの一時的な失敗のあとデータが更新されても、残った pin が sand のまま | 1 | 3 | spec 3 節 Pin thumbnail | M04 |
| 18 | map/createPhotoMap.ts:510 | m108 再読込の層を `"light"` に | ダークテーマでタイルが失敗して回復すると、基図がライトになり次の theme 変更まで残る | 1 | 3 | I8 | M05 |
| 19 | map/createPhotoMap.ts:313、:314 | m038 attribution を bottom-right、m040 zoom を bottom-left | 狭い画面で一覧を開くたび、シートの下に attribution や zoom が隠れる。attribution のテストはシートを開いていない | 5 | 3 | spec 9 節 Map、Checked（OSM の方針） | M07 |
| 20 | map/createPhotoMap.ts:289 | m034 fit の `maxZoom` を除去 | 保存状態なしで地図を開き写真が狭い範囲にあると、ズーム 15 で止まらず 19 まで寄る | 3 | 3 | `photo-diary.md` 72 行 | M10 |
| 21 | CalendarView.tsx:202 | c007 `openDate !== null` を除去 | 狭い画面の日付なし一覧で、strip が無いのに見出しが 81 px 下に止まる | 3 | 3 | spec 3 節「Not allowed: a strip for the undated list」 | P08 |
| 22 | MapView.tsx:271 | n003 `+ window.scrollY` を除去 | 低い viewport で文書がスクロールした状態の resize。stage の高さが変わる。カレンダーからの切り替え（N01）では差が出ない | 1 | 3 | spec 1 節 SPEC-PD-012 | N02 |
| 23 | PhotoList.tsx:167 | l012 panel にも calc の top | 実際の app header の下で地図の一覧をスクロールするたび、閉じる行がパネル上端から 56 px 下に止まる | 8 | 3 | spec 7 節「The panel heading does not change」 | N03 |

`rules/agents.md` の修正基準（F×I が 15 以上、または F が 1 以上で I が 8 以上）に届くのは **D1、1、2、3、4、5、6、7、8、10、19、23** の 12 件。

## 記録しておくこと

- **D1 は変異で見つけたが、実装の欠陥。** 他の finding はテストの穴で、今のコードの振る舞いは正しい。D1 だけは今のコードが spec と違う。m087 で通ることは確かめたが、除去が他の経路（読み込み前の `map.project`）で安全かは M08 と既存スイートの範囲でしか見ていない
- **m122、m133 の評価は D1 に依存する。** 今は `load` を待つので idle と同時に動き冗長に見える。D1 を直すと sourcedata が pin を出す唯一の経路になり、これらのテストの穴が効いてくる
- **プローブで差が出なかった変異。** m044、m086、m135（選択 12 回で pin の増減 0）、m064、m066（setPoints 直後の押下）、m110、m118、p018。理由は全行の表にある。m064 と m066 は 1 シナリオ 1 回の測定で、別の窓を否定していない
- **未測定。** h005、h006 は読解のみ。iOS と実タイルは対象外（n015）

## 生存した変異の全行

| id | 場所 | 変更 | 理由 |
|---|---|---|---|
| a004 | lib/dates.ts:68 | `const d = utcDate(year, m, start + i);` -> `const d = new Date(Date.UTC(year, m - 1, start + i));` | F0。年 0〜99 の日付だけ差が出る |
| a005 | lib/dates.ts:70 | ``${String(d.getUTCFullYear()).padStart(4, "0")}-` -> ``${d.getUTCFullYear()}-` | F0。年 1000 未満だけ差が出る |
| b005 | backend/router.py:60 | `if p.is_file() and p.suffix in _ASSET_TYPES` -> `if p.is_file()` | 同梱ファイルでは等価。assets/ に対象外の拡張子はない |
| c004 | CalendarView.tsx:66 | `const column = useHeldColumn(active);` -> `const column = useHeldColumn(true);` | 等価。hidden のとき getClientRects が 0 で usePinned:26 が止める |
| c006 | CalendarView.tsx:202 | `const stripEligible = active && !wide && openDate !== null && daysForMonth !== null;` -> `const stripEligible = active && openDate !== null && daysForMonth !== null;` | 等価。360 行の marker が `!wide` で描かれず reached が false のまま |
| c007 | CalendarView.tsx:202 | `const stripEligible = active && !wide && openDate !== null && daysForMonth !== null;` -> `const stripEligible = active && !wide && daysForMonth !== null;` | **FINDING 21** |
| c014 | CalendarView.tsx:213 | `if (scrollOnSettle.current === null \|\| scrollOnSettle.current !== url.date) return;` -> `if (scrollOnSettle.current === null) return;` | 普段の操作で起きない。読み込み中の一覧で strip を押し、遷移中にその一覧が settle する窓だけ。F1 I1 |
| c015 | CalendarView.tsx:214 | `    scrollOnSettle.current = null;⏎` -> `(除去)` | **FINDING 9** |
| c017 | CalendarView.tsx:215 | `- appHeaderHeight() - STRIP_HEIGHT;` -> `- STRIP_HEIGHT;` | **FINDING 8** |
| c024 | CalendarView.tsx:226 | `?.focus({ preventScroll: true });` -> `?.focus();` | 見た目だけ。open day が画面外になる極端に低い viewport で月バーが少しずれる |
| c029 | CalendarView.tsx:360 | `sticky top-[calc(var(--app-header-h,0px)+57px)] z-20 h-0` -> `sticky top-[calc(var(--app-header-h,0px)+57px)] h-0` | **FINDING 6** |
| c035 | CalendarView.tsx:401 | `group-data-[wide=false]/diary:mt-6` -> `group-data-[wide=false]/diary:mt-16` | 見た目だけ。余白の数値と STRIP_REACH の結びつき。strip が遅く出るだけ |
| c036 | CalendarView.tsx:326 | `                    active={active}⏎                    freshStart` -> `                    active={true}⏎                    freshStart` | 普段の操作で起きない。読み込み中に地図へ移った場合だけ fade が 1 回消える。F1 I1 |
| d011 | useDayPreview.ts:76 | `            if (first === undefined) return;⏎` -> `(除去)` | 普段の操作で起きない。消えた写真の日だけ `/api/files/undefined/thumbnail` が失敗して何も出ない。F1 I1 |
| d018 | useDayPreview.ts:75 | `const first = result.file_ids[0];` -> `const first = result.file_ids[result.file_ids.length - 1];` | 等価。limit=1 の答えは 1 件 |
| d021 | useDayPreview.ts:92 | `if (now && held.current.get(now.date) === now.id) held.current.delete(now.date);` -> `if (now) held.current.delete(now.date);` | 等価。表示中の id は保持中の id と同じ |
| d025 | useDayPreview.ts:98 | `  }, [version, drive]);` -> `  }, [version]);` | 等価。Session が `key={drive}` で再マウントする |
| d028 | useDayPreview.ts:101 | `    window.addEventListener("scroll", end, { passive: true });⏎` -> `(除去)` | **FINDING 12** |
| d029 | useDayPreview.ts:103 | `      window.removeEventListener("scroll", end);⏎      end();⏎` -> `      window.removeEventListener("scroll", end);⏎` | 軽微。unmount 後の待ち時間に 1 回余分な読み取り。画面は消える。F1 I1 |
| d030 | useDayPreview.ts:103 | `      window.removeEventListener("scroll", end);⏎      end();⏎` -> `      end();⏎` | 等価。unmount 済みの end は no-op |
| e013 | DayCell.tsx:60 | `step >= 3 && open ? INNER_RING` -> `step >= 2 && open ? INNER_RING` | 見た目だけ。step 2 の選択日にも内側リング |
| e015 | DayCell.tsx:60 | `step >= 3 && open ? INNER_RING` -> `step >= 3 ? INNER_RING` | 見た目だけ。step 3 以上の非選択日にも内側リング |
| e016 | DayCell.tsx:60 | `${STEP_SURFACE[step]} ${step >= 3 && open ? INNER_RING : ""} text-text-primary`` -> `${STEP_SURFACE[step]} ${step >= 3 && open ? INNER_RING : ""} text-text-muted`` | 見た目だけ。日付の文字色 |
| e017 | DayCell.tsx:62 | ``${NOTE_SURFACE} text-text-primary`` -> ``${NOTE_SURFACE} text-text-muted`` | 見た目だけ。ノートだけの日の文字色 |
| e018 | DayCell.tsx:51 | `hasNote && count > 0⏎` -> `hasNote && count > 1⏎` | 支援技術の読み上げだけ。ノートあり 1 枚の日の名前から枚数が落ちる。F3 I1 |
| e024 | DayCell.tsx:75 | `open ? "border-accent" : "border-transparent"` -> `"border-transparent"` | **FINDING 3** |
| e025 | DayCell.tsx:75 | `SIZE[variant]` -> `SIZE.grid` | 見た目だけ。strip の高さ h-11 から 4 px はみ出す |
| e026 | DayCell.tsx:15 | `strip: "h-11",` -> `strip: "h-14",` | 見た目だけ。同上 |
| e027 | DayCell.tsx:79 | `hasNote && variant === "grid" && (` -> `hasNote && (` | 見た目だけ。strip にノートのマーク |
| e028 | DayCell.tsx:87 | `{count > 0 && (⏎` -> `{count > 1 && (⏎` | **FINDING 4** |
| g004 | MonthGrid.tsx:40 | `if (loading \|\| !active \|\| lastDrawn.current === month) return;` -> `if (loading \|\| lastDrawn.current === month) return;` | 普段の操作で起きない。c036 と同じ窓 |
| g012 | MonthGrid.tsx:46 | `    fades.current.clear();⏎` -> `(除去)` | 等価。古い月の日付キーは cancel されない |
| g018 | MonthGrid.tsx:56 | `easing: "ease-out",` -> `easing: "linear",` | 見た目だけ |
| g021 | MonthGrid.tsx:61 | `  }, [month, loading, active, freshStart, days]);` -> `  }, [month, loading, freshStart, days]);` | 普段の操作で起きない。c036 と同じ窓 |
| g022 | MonthGrid.tsx:61 | `  }, [month, loading, active, freshStart, days]);` -> `  }, [month, active, freshStart, days]);` | 等価。`days` が毎回新しい Map で effect が走る |
| g028 | MonthGrid.tsx:93 | `              if (element) buttons.current.set(date, element);⏎              else buttons.` -> `              if (element) buttons.current.set(date, element);⏎` | 等価。古い要素は days に無く skip される。メモリだけ |
| h005 | PhotoDiaryPage.tsx:47 | `className="flex w-full min-w-0 flex-1 flex-col"` -> `(除去)` | core の main は flex-col で幅は stretch される。読んだ判断で未測定 |
| h006 | PhotoDiaryPage.tsx:47 | `className="flex w-full min-w-0 flex-1 flex-col"` -> `className="flex w-full min-w-0 flex-col"` | 同上 |
| h009 | PhotoDiaryPage.tsx:204 | `    freshStart.current = true;⏎` -> `(除去)` | 見た目だけ。query 付きで開いたページのサイドバー再開で fade が出ない。F3 I1 |
| h011 | PhotoDiaryPage.tsx:49 | `width="wide"` -> `width="full"` | 見た目だけ。1280 を超える幅で見出しの位置が変わる |
| l003 | PhotoList.tsx:24 | `iconOnly variant="ghost" aria-label={label}` -> `iconOnly aria-label={label}` | 見た目だけ |
| l009 | PhotoList.tsx:136 | `onSettledRef.current = onSettled;` -> `(除去)` | 等価。一覧は listKey で再マウントし、初回の closure で足りる |
| l012 | PhotoList.tsx:167 | `style={scroller === "window" ? { top:` -> `style={true ? { top:` | **FINDING 23** |
| l014 | PhotoList.tsx:14 | `const HEADING_ROW = "sticky z-10 flex` -> `const HEADING_ROW = "sticky flex` | 見た目だけ。既存の heading の z 順。c029 と同じ型だが今回の変更ではない |
| l015 | PhotoList.tsx:14 | `const HEADING_ROW = "sticky z-10 flex items-center gap-3 bg-bg-primary pb-3"` -> `const HEADING_ROW = "sticky z-10 flex items-center gap-3 pb-3"` | 見た目だけ。既存の heading の背景。今回の変更ではない |
| m002 | map/createPhotoMap.ts:24 | `const PIN_MARGIN = 68;` -> `const PIN_MARGIN = 0;` | **FINDING 15** |
| m004 | map/createPhotoMap.ts:25 | `const MOVE_SYNC_MS = 150;` -> `const MOVE_SYNC_MS = 60000;` | 見た目だけ。ドラッグ中に新しい pin が出ず moveend で出る |
| m009 | map/createPhotoMap.ts:165 | `return x === y ? b - a : x < y ? 1 : -1;` -> `return x === y ? a - b : x < y ? 1 : -1;` | 等価。taken_at が同じ写真のどちらも「最新」 |
| m021 | map/createPhotoMap.ts:216 | `"circle-opacity": 0,` -> `"circle-opacity": 1,` | 見た目だけ。半径 1 px の点が pin の下に出る |
| m028 | map/createPhotoMap.ts:267 | `  badge.setAttribute("aria-hidden", "true");⏎` -> `(除去)` | 等価。button の aria-label が名前を決める |
| m030 | map/createPhotoMap.ts:271 | `text-align:center;pointer-events:none"` -> `text-align:center"` | 等価。badge への押下は button に届く |
| m034 | map/createPhotoMap.ts:289 | `fitBoundsOptions: { padding: 48, maxZoom: FIT_MAX_ZOOM }` -> `fitBoundsOptions: { padding: 48 }` | **FINDING 20** |
| m038 | map/createPhotoMap.ts:313 | `{ compact: false }), "top-left"` -> `{ compact: false }), "bottom-right"` | **FINDING 19** |
| m040 | map/createPhotoMap.ts:314 | `{ showCompass: false }), "top-right"` -> `{ showCompass: false }), "bottom-left"` | **FINDING 19** |
| m042 | map/createPhotoMap.ts:319 | `position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none` -> `position:absolute;inset:0;z-index:1;pointer-events:none` | 等価。stage が overflow-hidden |
| m043 | map/createPhotoMap.ts:319 | `position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none` -> `position:absolute;inset:0;z-index:1;overflow:hidden` | 等価。イベントは canvas container へ bubble する |
| m044 | map/createPhotoMap.ts:329 | `let dataPending = true;` -> `let dataPending = false;` | プローブ M11 で差なし（選択 12 回で pin の増減 0） |
| m048 | map/createPhotoMap.ts:344 | `    if (photoId === undefined) return null;⏎` -> `(除去)` | 普段の操作で起きない。dataPending が先に止める |
| m057 | map/createPhotoMap.ts:361 | `    if (failedPhotos.has(pin.photoId)) return;⏎` -> `(除去)` | **FINDING 16** |
| m058 | map/createPhotoMap.ts:362 | `    pin.image.style.display = "";⏎` -> `(除去)` | **FINDING 17** |
| m061 | map/createPhotoMap.ts:383 | `if (found?.key === pin.key && found.clusterId !== null` -> `if (found && found.clusterId !== null` | 等価。結果は 391 行で検査される |
| m062 | map/createPhotoMap.ts:387 | `    if (pin.clusterId !== null && !candidates.includes(pin.clusterId)) candidates.push(pin` -> `(除去)` | 普段の操作で起きない。画面内の pin は features に出る |
| m064 | map/createPhotoMap.ts:391 | `if (ids.length === pin.count && ids.includes(pin.photoId)) return ids;` -> `return ids;` | プローブ M09 で差なし（setPoints 直後の押下）。F0 |
| m065 | map/createPhotoMap.ts:391 | `if (ids.length === pin.count && ids.includes(pin.photoId)) return ids;` -> `if (ids.includes(pin.photoId)) return ids;` | m064 と同じ窓。F0 |
| m066 | map/createPhotoMap.ts:391 | `if (ids.length === pin.count && ids.includes(pin.photoId)) return ids;` -> `if (ids.length === pin.count) return ids;` | プローブ M09 で差なし。F0 |
| m067 | map/createPhotoMap.ts:398 | `      const ids = await membersOf(pin);⏎      if (destroyed) return;⏎` -> `      const ids = await membersOf(pin);⏎` | 普段の操作で起きない。押下から数 ms で map を破棄した場合だけ。F1 I1 |
| m068 | map/createPhotoMap.ts:401 | `    } catch (error) {⏎      if (destroyed) return;⏎` -> `    } catch (error) {⏎` | 同上 |
| m072 | map/createPhotoMap.ts:425 | `      failedPhotos.add(pin.photoId);⏎` -> `(除去)` | **FINDING 16** |
| m078 | map/createPhotoMap.ts:433 | `      pressedAt = null;⏎` -> `(除去)` | 普段の操作で起きない。マウス押下のあと同じ pin をキーボードで押す場合だけ。F1 I3 |
| m086 | map/createPhotoMap.ts:452 | `if (dataPending \|\| !loaded \|\| !onScreen()) return;` -> `if (!loaded \|\| !onScreen()) return;` | プローブ M11 で差なし |
| m087 | map/createPhotoMap.ts:452 | `if (dataPending \|\| !loaded \|\| !onScreen()) return;` -> `if (dataPending \|\| !onScreen()) return;` | **実装の欠陥 D1 の修正方向**。この変異だけ M08 が通る |
| m088 | map/createPhotoMap.ts:452 | `if (dataPending \|\| !loaded \|\| !onScreen()) return;` -> `if (dataPending \|\| !loaded) return;` | 普段の操作で起きない。hidden の間は sync を呼ぶ event が来ない |
| m089 | map/createPhotoMap.ts:458 | `if (!seen \|\| wanted.has(seen.key)) continue;` -> `if (!seen) continue;` | 等価。タイル間の重複は同じ位置 |
| m093 | map/createPhotoMap.ts:460 | ` \|\| at.y > height + PIN_MARGIN) continue;` -> `) continue;` | **FINDING 14** |
| m098 | map/createPhotoMap.ts:476 | `      kept.lngLat = seen.lngLat;⏎` -> `(除去)` | 普段の操作で起きない。同じ枚数と写真で中心だけ変わるデータ更新。F1 I1 |
| m099 | map/createPhotoMap.ts:477 | `      kept.clusterId = seen.clusterId;⏎` -> `(除去)` | m062 と同じ |
| m102 | map/createPhotoMap.ts:491 | `if (!loaded \|\| theme === appliedTheme \|\| !onScreen()) return;` -> `if (theme === appliedTheme \|\| !onScreen()) return;` | 普段の操作で起きない。読み込み前の theme 変更 |
| m103 | map/createPhotoMap.ts:491 | `if (!loaded \|\| theme === appliedTheme \|\| !onScreen()) return;` -> `if (!loaded \|\| !onScreen()) return;` | 等価。同じ値の塗り直し |
| m108 | map/createPhotoMap.ts:510 | `const layers = baseLayers(appliedTheme);` -> `const layers = baseLayers("light");` | **FINDING 18** |
| m109 | map/createPhotoMap.ts:514 | `map.addLayer(base, "clusters");` -> `map.addLayer(base);` | 等価。上の circle は何も描かない |
| m110 | map/createPhotoMap.ts:513 | `    map.addSource(TILE_SOURCE, tileSource(options));⏎` -> `    map.addSource(TILE_SOURCE, { ...tileSource(options), attribution: undefined });⏎` | プローブ M05 で差なし（回復後も attribution が出る） |
| m111 | map/createPhotoMap.ts:517 | `  const onIdle = () => {⏎    dataPending = false;⏎` -> `  const onIdle = () => {⏎` | 冗長。sourcedata の経路が同じ値を入れる |
| m112 | map/createPhotoMap.ts:518 | `    dataPending = false;⏎    syncPins();⏎    if (tileFailed) {` -> `    dataPending = false;⏎    if (tileFailed) {` | 冗長。sourcedata と moveend が同期する |
| m114 | map/createPhotoMap.ts:521 | `      tileFailed = false;⏎      verifyingTiles = false;⏎` -> `      tileFailed = false;⏎` | 普段の操作で起きない。F1 I1。検証中の失敗のあと次の idle で notice が早く消える |
| m115 | map/createPhotoMap.ts:526 | `        verifyingTiles = false;⏎        reportTiles(false);⏎` -> `        reportTiles(false);⏎` | 等価。522 行の分岐が reset する |
| m118 | map/createPhotoMap.ts:536 | `if (event.sourceId === TILE_SOURCE) tileFailed = true;` -> `tileFailed = true;` | プローブ M06 で差なし（glyph の失敗は map の error に来ない） |
| m119 | map/createPhotoMap.ts:540 | `if (event.sourceId !== "points" \|\| !event.isSourceLoaded) return;` -> `if (!event.isSourceLoaded) return;` | dataPending の経路。M11 と同じく差が出ない |
| m120 | map/createPhotoMap.ts:540 | `if (event.sourceId !== "points" \|\| !event.isSourceLoaded) return;` -> `if (event.sourceId !== "points") return;` | 同上 |
| m121 | map/createPhotoMap.ts:540 | `return;⏎    dataPending = false;⏎    syncPins();⏎  };⏎⏎  const onMove` -> `return;⏎    syncPins();⏎  };⏎⏎  const onMove` | 同上 |
| m122 | map/createPhotoMap.ts:541 | `    dataPending = false;⏎    syncPins();⏎  };⏎⏎  const onMove` -> `    dataPending = false;⏎  };⏎⏎  const onMove` | 冗長。idle が同期する |
| m123 | map/createPhotoMap.ts:546 | `    if (moveTimer !== null) return;⏎` -> `(除去)` | m004 と同じ。見た目だけ |
| m124 | map/createPhotoMap.ts:548 | `      moveTimer = null;⏎      syncPins();⏎` -> `      moveTimer = null;⏎` | m004 と同じ |
| m125 | map/createPhotoMap.ts:548 | `      moveTimer = null;⏎      syncPins();⏎` -> `      syncPins();⏎` | m004 と同じ |
| m126 | map/createPhotoMap.ts:553 | `  const onMoveEnd = () => {⏎    syncPins();⏎` -> `  const onMoveEnd = () => {⏎` | 冗長。idle が同期する |
| m128 | map/createPhotoMap.ts:560 | `    loaded = true;⏎    applyTheme();⏎` -> `    loaded = true;⏎` | 普段の操作で起きない。読み込み中の theme 変更。F1 I3 |
| m129 | map/createPhotoMap.ts:561 | `    applyTheme();⏎    syncPins();⏎  });` -> `    applyTheme();⏎  });` | 冗長。idle が同期する |
| m131 | map/createPhotoMap.ts:565 | `  map.on("render", placePins);⏎` -> `(除去)` | **FINDING 1** |
| m132 | map/createPhotoMap.ts:566 | `  map.on("move", onMove);⏎` -> `(除去)` | m004 と同じ |
| m133 | map/createPhotoMap.ts:567 | `  map.on("sourcedata", onSourceData as never);⏎` -> `(除去)` | 冗長。idle が同期する（D1 を直すと意味が変わる） |
| m135 | map/createPhotoMap.ts:577 | `    dataPending = true;⏎    source.setData` -> `    source.setData` | プローブ M11 で差なし |
| m136 | map/createPhotoMap.ts:574 | `      map.once("styledata", drawData);⏎` -> `(除去)` | 普段の操作で起きない。style の読み込み前に points が変わる場合だけ。F1 I3 |
| m140 | map/createPhotoMap.ts:586 | `      for (const pin of pins.values()) if (pin.image.style.display === "none") loadImage(p` -> `(除去)` | **FINDING 17** |
| m142 | map/createPhotoMap.ts:591 | `if (next.size === selected.size && [...next].every((id) => selected.has(id))) return;` -> `(除去)` | 等価。余分な setData だけ |
| m147 | map/createPhotoMap.ts:596 | `      applyTheme();⏎      syncPins();⏎    },⏎    destroy` -> `      applyTheme();⏎    },⏎    destroy` | 冗長。hidden の間に pin の入力は変わらない |
| m148 | map/createPhotoMap.ts:600 | `      destroyed = true;⏎` -> `(除去)` | 普段の操作で起きない。破棄と応答の競合 |
| m149 | map/createPhotoMap.ts:601 | `      themeWatcher.disconnect();⏎` -> `(除去)` | 普段の操作で起きない。破棄後の theme 変更でコンソールにエラー。F1 I1 |
| m150 | map/createPhotoMap.ts:602 | `      if (moveTimer !== null) clearTimeout(moveTimer);⏎` -> `(除去)` | 普段の操作で起きない。破棄直後の timer。F1 I1 |
| m151 | map/createPhotoMap.ts:603 | `      for (const pin of pins.values()) removePin(pin);⏎` -> `(除去)` | 等価。map.remove が要素ごと消す |
| m152 | map/createPhotoMap.ts:605 | `      layer.remove();⏎` -> `(除去)` | 等価。同上 |
| n003 | MapView.tsx:271 | `getBoundingClientRect().top + window.scrollY)` -> `getBoundingClientRect().top)` | **FINDING 22** |
| n012 | MapView.tsx:283 | `<div className={showMap ? "px-4" : ""}>` -> `<div>` | 見た目だけ |
| n015 | MapView.tsx:41 | `pb-[max(1rem,env(safe-area-inset-bottom))]` -> `pb-4` | 見た目だけ。iOS の safe area。R-5 の範囲 |
| n018 | MapView.tsx:209 | `created.setSelected(openIdsRef.current);` -> `(除去)` | 等価に近い。作成時の selected オプションが同じ値を渡す |
| n023 | MapView.tsx:317 | `top-3 z-10 -translate-x-1/2` -> `top-3 -translate-x-1/2` | 見た目だけ |
| p003 | usePinned.ts:11 | `export const HOLD_GAP = 16;` -> `export const HOLD_GAP = 0;` | **FINDING 11** |
| p004 | usePinned.ts:26 | `if (!activeRef.current \|\| !node \|\| node.getClientRects().length === 0) return;` -> `if (!node \|\| node.getClientRects().length === 0) return;` | 等価。hidden は getClientRects が 0 |
| p005 | usePinned.ts:26 | `if (!activeRef.current \|\| !node \|\| node.getClientRects().length === 0) return;` -> `if (!activeRef.current \|\| !node) return;` | 等価。active が false |
| p006 | usePinned.ts:26 | `if (!activeRef.current \|\| !node \|\| node.getClientRects().length === 0) return;` -> `if (!node) return;` | 等価。戻るときの layout effect が描画前に測り直す |
| p007 | usePinned.ts:27 | `+ appHeaderHeight() + HOLD_GAP <= window.innerHeight` -> `+ appHeaderHeight() + HOLD_GAP < window.innerHeight` | 等価。ちょうど同じ高さだけ |
| p008 | usePinned.ts:27 | `node.getBoundingClientRect().height + appHeaderHeight() + HOLD_GAP <=` -> `node.getBoundingClientRect().height + HOLD_GAP <=` | **FINDING 11** |
| p009 | usePinned.ts:27 | `node.getBoundingClientRect().height + appHeaderHeight() + HOLD_GAP <=` -> `node.getBoundingClientRect().height + appHeaderHeight() <=` | **FINDING 11** |
| p010 | usePinned.ts:32 | `  }, [measure, active]);` -> `  }, [measure]);` | 等価。戻ると ResizeObserver が発火する |
| p011 | usePinned.ts:30 | `  useLayoutEffect(() => {⏎    measure();⏎  }, [measure, active]);⏎` -> `(除去)` | 等価。observe の初回発火 |
| p013 | usePinned.ts:38 | `    window.addEventListener("resize", measure);⏎    return () => {⏎      observer.disconne` -> `    return () => {⏎      observer.disconnect();` | **FINDING 10** |
| p014 | usePinned.ts:58 | `    if (!enabled \|\| !node) {⏎      setReached(false);⏎      return;⏎    }⏎` -> `    if (!node) {⏎      setReached(false);⏎      return;⏎    }⏎` | 等価。marker が描かれず node が null |
| p015 | usePinned.ts:59 | `      setReached(false);⏎` -> `(除去)` | 等価。`enabled && reached` が隠し、再開時に測り直す |
| p018 | usePinned.ts:64 | `top <= appHeaderHeight() + offset + 0.5)` -> `top <= appHeaderHeight() + offset)` | プローブ P15 で差なし（56.3 / 56.4 / 56.7 px の header） |
| p021 | usePinned.ts:64 | `top <= appHeaderHeight() + offset + 0.5)` -> `top <= appHeaderHeight() + offset + 200)` | **FINDING 7** |
| p024 | usePinned.ts:66 | `    window.addEventListener("scroll", measure, { passive: true });⏎    window.addEventList` -> `    window.addEventListener("scroll", measure, { passive: true });⏎` | 冗長。幅の変化は ResizeObserver が拾う |
| p025 | usePinned.ts:70 | `    if (node.previousElementSibling) observer.observe(node.previousElementSibling);⏎` -> `(除去)` | 普段の操作で起きない。スクロールなしに column の高さが変わる場合だけ。F1 I1 |
| p026 | usePinned.ts:72 | `      window.removeEventListener("scroll", measure);⏎` -> `(除去)` | 等価。古い listener は無害 |
| p027 | usePinned.ts:78 | `reached: enabled && reached }` -> `reached }` | 等価。呼び出し元が stripEligible で隠す |
| p028 | usePinned.ts:21 | `const [fits, setFits] = useState(false);` -> `const [fits, setFits] = useState(true);` | 等価。初回の layout effect が描画前に直す |
| s029 | map/mapStyle.ts:119 | `"line-color": p.rail` -> `"line-color": p.majorRoad` | 見た目だけ。線路の色が主要道路の色に近い値になる |
| s036 | map/mapStyle.ts:131 | `"text-halo-color": p.halo` -> `"text-halo-color": p.land` | 等価。両パレットで halo と land が同じ値 |
| s039 | map/mapStyle.ts:140 | `layer.type === "background" ? {} :` -> `false ? {} :` | 等価。background の source は無視される |
| v005 | DayPreview.tsx:11 | `Math.max(GAP, Math.min(value, max - GAP))` -> `Math.max(GAP, value)` | **FINDING 13** |
| v012 | DayPreview.tsx:14 | `above >= GAP ? above` -> `above > GAP ? above` | 等価。ちょうど 8 px だけ |
| v014 | DayPreview.tsx:17 | `top: clamp(top, window.innerHeight - HEIGHT)` -> `top` | F0。高さ 290 px 未満の viewport だけ |
| v016 | DayPreview.tsx:28 | `aria-hidden="true"` -> `(除去)` | 等価。img の alt が空 |
| v023 | DayPreview.tsx:35 | `key={view.id}` -> `(除去)` | 等価。end が view を null にしてから次の表示になる |
| v024 | DayPreview.tsx:40 | `h-full w-full object-cover` -> `h-full w-full object-contain` | 見た目だけ |
| v025 | DayPreview.tsx:43 | `    document.body,⏎` -> `    document.documentElement,⏎` | 見た目だけ。同じ fixed 配置 |
| w002 | WeekStrip.tsx:18 | `export const STRIP_REACH = STRIP_HEIGHT - 24;` -> `export const STRIP_REACH = STRIP_HEIGHT;` | **FINDING 7** |
| w006 | WeekStrip.tsx:49 | `day={Number(date.slice(8))}` -> `day={Number(date.slice(5, 7))}` | **FINDING 2** |
| w007 | WeekStrip.tsx:52 | `variant="strip"` -> `variant="grid"` | 見た目だけ。strip のセル高さとノートのマーク |
| w011 | WeekStrip.tsx:38 | `formatMonth(month, locale)` -> `month` | 見た目だけ。月が 2026-10 の形になる |
| w013 | WeekStrip.tsx:36 | `border-b border-bg-border bg-bg-primary` -> `border-b border-bg-border` | **FINDING 5** |

## キルした変異（最初に落ちたテスト）

| id | 場所 | テスト |
|---|---|---|
| a001 | lib/dates.ts:66 | vitest: lib/dates.test.ts > weekOf > SPEC-PD-009: 2026-10-10 is in 2026-10-04 to 2026-10-1 |
| a002 | lib/dates.ts:66 | vitest: lib/dates.test.ts > weekOf > SPEC-PD-009: 2026-10-04 is in 2026-10-04 to 2026-10-1 |
| a003 | lib/dates.ts:67 | vitest: lib/dates.test.ts > weekOf > SPEC-PD-009: 2026-10-04 is in 2026-10-04 to 2026-10-1 |
| a006 | lib/dates.ts:70 | vitest: lib/dates.test.ts > weekOf > SPEC-PD-009: 2026-10-04 is in 2026-10-04 to 2026-10-1 |
| a007 | lib/dates.ts:70 | vitest: lib/dates.test.ts > weekOf > SPEC-PD-009: 2026-10-04 is in 2026-10-04 to 2026-10-1 |
| b001 | backend/router.py:55 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_ever |
| b002 | backend/router.py:55 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_each |
| b003 | backend/router.py:54 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_each |
| b004 | backend/router.py:54 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_ever |
| b006 | backend/router.py:63 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_defa |
| b007 | backend/router.py:63 | pytest: FAILED addons/photo_diary-src/tests/test_map_config_and_assets.py::test_pd004_defa |
| c001 | CalendarView.tsx:277 | e2e: calendarPolish.spec.ts:452:7 › SPEC-PD-009: the calendar column on a wide layout › I5 |
| c002 | CalendarView.tsx:277 | e2e: calendarPolish.spec.ts:430:7 › SPEC-PD-009: the calendar column on a wide layout › is |
| c003 | CalendarView.tsx:35 | e2e: calendarPolish.spec.ts:430:7 › SPEC-PD-009: the calendar column on a wide layout › is |
| c005 | CalendarView.tsx:202 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is not s |
| c008 | CalendarView.tsx:202 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is not s |
| c009 | CalendarView.tsx:203 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| c010 | CalendarView.tsx:204 | vitest: DailyNotes.test.tsx > SPEC-PD-006 I4: the mark > a mark comes and goes with the st |
| c011 | CalendarView.tsx:207 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| c012 | CalendarView.tsx:208 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| c013 | CalendarView.tsx:209 | e2e: calendarPolish.spec.ts:556:7 › SPEC-PD-009: the one-week strip on a narrow layout › I |
| c016 | CalendarView.tsx:215 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| c018 | CalendarView.tsx:215 | e2e: calendarPolish.spec.ts:556:7 › SPEC-PD-009: the one-week strip on a narrow layout › I |
| c019 | CalendarView.tsx:216 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| c020 | CalendarView.tsx:222 | e2e: calendarPolish.spec.ts:614:7 › SPEC-PD-009: the one-week strip on a narrow layout › t |
| c021 | CalendarView.tsx:222 | e2e: calendarPolish.spec.ts:614:7 › SPEC-PD-009: the one-week strip on a narrow layout › t |
| c022 | CalendarView.tsx:223 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > the back |
| c023 | CalendarView.tsx:226 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > the back |
| c025 | CalendarView.tsx:200 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| c026 | CalendarView.tsx:200 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| c027 | CalendarView.tsx:200 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| c028 | CalendarView.tsx:360 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| c030 | CalendarView.tsx:360 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| c031 | CalendarView.tsx:360 | e2e: calendarPolish.spec.ts:540:7 › SPEC-PD-009: the one-week strip on a narrow layout › I |
| c032 | CalendarView.tsx:382 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| c033 | CalendarView.tsx:383 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > gives th |
| c034 | CalendarView.tsx:383 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is not s |
| c037 | CalendarView.tsx:327 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| c038 | CalendarView.tsx:327 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > does not run fo |
| c039 | CalendarView.tsx:411 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| c040 | CalendarView.tsx:411 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > failure: a preview thumbnail that |
| c041 | CalendarView.tsx:410 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| c042 | CalendarView.tsx:273 | e2e: calendarPolish.spec.ts:430:7 › SPEC-PD-009: the calendar column on a wide layout › is |
| c043 | CalendarView.tsx:280 | e2e: page.spec.ts:26:11 › the month picker stays inside the screen › SPEC-PD-001: en at 32 |
| d001 | useDayPreview.ts:6 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d002 | useDayPreview.ts:6 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d003 | useDayPreview.ts:45 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d004 | useDayPreview.ts:46 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d005 | useDayPreview.ts:47 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d006 | useDayPreview.ts:53 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > leaving before 120 ms reads nothi |
| d007 | useDayPreview.ts:54 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > I2: a day with count 0 reads noth |
| d008 | useDayPreview.ts:54 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > I2: a device that cannot hover ma |
| d009 | useDayPreview.ts:54 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d010 | useDayPreview.ts:74 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d012 | useDayPreview.ts:77 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d013 | useDayPreview.ts:67 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d014 | useDayPreview.ts:68 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d015 | useDayPreview.ts:62 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d016 | useDayPreview.ts:57 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d017 | useDayPreview.ts:72 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| d019 | useDayPreview.ts:88 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d020 | useDayPreview.ts:92 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > failure: a preview thumbnail that |
| d022 | useDayPreview.ts:92 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > failure: a preview thumbnail that |
| d023 | useDayPreview.ts:97 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d024 | useDayPreview.ts:98 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d026 | useDayPreview.ts:99 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| d027 | useDayPreview.ts:99 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| e001 | DayCell.tsx:20 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e002 | DayCell.tsx:20 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e003 | DayCell.tsx:21 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e004 | DayCell.tsx:21 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e005 | DayCell.tsx:22 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e006 | DayCell.tsx:22 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e007 | DayCell.tsx:23 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e008 | DayCell.tsx:23 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e009 | DayCell.tsx:25 | e2e: calendarPolish.spec.ts:79:7 › SPEC-PD-008: a day's surface deepens with its photo cou |
| e010 | DayCell.tsx:26 | e2e: calendarPolish.spec.ts:79:7 › SPEC-PD-008: a day's surface deepens with its photo cou |
| e011 | DayCell.tsx:30 | e2e: calendarPolish.spec.ts:132:7 › SPEC-PD-008: a day's surface deepens with its photo co |
| e012 | DayCell.tsx:30 | e2e: calendarPolish.spec.ts:132:7 › SPEC-PD-008: a day's surface deepens with its photo co |
| e014 | DayCell.tsx:60 | e2e: calendarPolish.spec.ts:132:7 › SPEC-PD-008: a day's surface deepens with its photo co |
| e019 | DayCell.tsx:53 | vitest: DailyNotes.test.tsx > SPEC-PD-006: every day is a button > pressing a day with a n |
| e020 | DayCell.tsx:70 | vitest: DailyNotes.test.tsx > SPEC-PD-007 I8: the Today control > reaches a month with no  |
| e021 | DayCell.tsx:71 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |
| e022 | DayCell.tsx:73 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| e023 | DayCell.tsx:74 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| e029 | DayCell.tsx:88 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e030 | DayCell.tsx:88 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e031 | DayCell.tsx:72 | vitest: DailyNotes.test.tsx > SPEC-PD-006: every day is a button > a day with neither phot |
| e032 | DayCell.tsx:59 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| e033 | DayCell.tsx:48 | e2e: calendarPolish.spec.ts:79:7 › SPEC-PD-008: a day's surface deepens with its photo cou |
| g001 | MonthGrid.tsx:11 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g002 | MonthGrid.tsx:12 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g003 | MonthGrid.tsx:40 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g005 | MonthGrid.tsx:40 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when anoth |
| g006 | MonthGrid.tsx:41 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > does not run fo |
| g007 | MonthGrid.tsx:41 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when anoth |
| g008 | MonthGrid.tsx:42 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when anoth |
| g009 | MonthGrid.tsx:43 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > does not run fo |
| g010 | MonthGrid.tsx:44 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > does not run un |
| g011 | MonthGrid.tsx:44 | e2e: calendarPolish.spec.ts:173:7 › SPEC-PD-008 I3: the fade › a page opened with no query |
| g013 | MonthGrid.tsx:49 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g014 | MonthGrid.tsx:49 | vitest: DailyNotes.test.tsx > SPEC-PD-006: every day is a button > a day with neither phot |
| g015 | MonthGrid.tsx:54 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g016 | MonthGrid.tsx:55 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g017 | MonthGrid.tsx:55 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g019 | MonthGrid.tsx:57 | e2e: calendarPolish.spec.ts:191:7 › SPEC-PD-008 I3: the fade › the last day is clear while |
| g020 | MonthGrid.tsx:53 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| g023 | MonthGrid.tsx:97 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > pressing a day ends its preview |
| g024 | MonthGrid.tsx:102 | e2e: calendarPolish.spec.ts:263:7 › SPEC-PD-008 I3: the fade › a hover applies at once, th |
| g025 | MonthGrid.tsx:103 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > I2: a day with count 0 reads noth |
| g026 | MonthGrid.tsx:103 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| g027 | MonthGrid.tsx:105 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| g029 | MonthGrid.tsx:90 | vitest: DailyNotes.test.tsx > SPEC-PD-007 I8: the Today control > reaches a month with no  |
| h001 | PhotoDiaryPage.tsx:55 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the view switch's place > is in the header' |
| h002 | PhotoDiaryPage.tsx:55 | vitest: PhotoDiaryPage.test.tsx > SPEC-PD-001: calendar > opens on the newest month with d |
| h003 | PhotoDiaryPage.tsx:56 | vitest: PhotoDiaryPage.test.tsx > SPEC-PD-001: calendar > opens on the newest month with d |
| h004 | PhotoDiaryPage.tsx:56 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the view switch's place > is in the header' |
| h007 | PhotoDiaryPage.tsx:116 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| h008 | PhotoDiaryPage.tsx:116 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > does not run fo |
| h010 | PhotoDiaryPage.tsx:269 | vitest: UiPolishStates.test.tsx > SPEC-PD-008 I3: when the surfaces fade > runs when the p |
| l001 | PhotoList.tsx:24 | vitest: UiPolish.test.tsx > SPEC-PD-012: every close control of a list is an icon-only x i |
| l002 | PhotoList.tsx:24 | e2e: pagePolish.spec.ts:194:9 › SPEC-PD-012: the close control › on a coarse pointer › its |
| l004 | PhotoList.tsx:24 | vitest: PhotoDiaryPage.test.tsx > SPEC-PD-001: calendar > pressing a day fetches its photo |
| l005 | PhotoList.tsx:25 | vitest: UiPolish.test.tsx > SPEC-PD-012: every close control of a list is an icon-only x i |
| l006 | PhotoList.tsx:134 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| l007 | PhotoList.tsx:134 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > waits fo |
| l008 | PhotoList.tsx:134 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > waits fo |
| l010 | PhotoList.tsx:138 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > waits fo |
| l011 | PhotoList.tsx:167 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is not s |
| l013 | PhotoList.tsx:166 | e2e: page.spec.ts:75:9 › the list's close control stays reachable while the list scrolls › |
| m001 | map/createPhotoMap.ts:15 | e2e: mapPolish.spec.ts:353:7 › SPEC-PD-011: a pin is a photo with a count badge › two phot |
| m003 | map/createPhotoMap.ts:24 | e2e: mapPolish.spec.ts:300:7 › SPEC-PD-011: a pin is a photo with a count badge › I10: onl |
| m005 | map/createPhotoMap.ts:27 | e2e: mapPolish.spec.ts:283:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a cl |
| m006 | map/createPhotoMap.ts:27 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m007 | map/createPhotoMap.ts:161 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m008 | map/createPhotoMap.ts:165 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m010 | map/createPhotoMap.ts:167 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m011 | map/createPhotoMap.ts:179 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m012 | map/createPhotoMap.ts:179 | e2e: map.spec.ts:31:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m013 | map/createPhotoMap.ts:219 | e2e: map.spec.ts:168:7 › I10: tile requests › SPEC-PD-004 I10: the map contacts no host bu |
| m014 | map/createPhotoMap.ts:208 | e2e: mapBehaviour.spec.ts:106:7 › tiles › SPEC-PD-010: vector tiles are asked for at the m |
| m015 | map/createPhotoMap.ts:209 | e2e: attribution.spec.ts:6:5 › SPEC-PD-004: the attribution stays visible at a narrow widt |
| m016 | map/createPhotoMap.ts:227 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m017 | map/createPhotoMap.ts:228 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m018 | map/createPhotoMap.ts:228 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m019 | map/createPhotoMap.ts:229 | e2e: map.spec.ts:47:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m020 | map/createPhotoMap.ts:233 | e2e: mapPolish.spec.ts:111:7 › SPEC-PD-010: the base map › I8: a map made in the dark them |
| m022 | map/createPhotoMap.ts:261 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m023 | map/createPhotoMap.ts:261 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m024 | map/createPhotoMap.ts:261 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m025 | map/createPhotoMap.ts:261 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m026 | map/createPhotoMap.ts:261 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m027 | map/createPhotoMap.ts:266 | e2e: mapBehaviour.spec.ts:11:7 › count labels › SPEC-PD-002: a point of several photos sho |
| m029 | map/createPhotoMap.ts:269 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m031 | map/createPhotoMap.ts:270 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m032 | map/createPhotoMap.ts:202 | e2e: mapPolish.spec.ts:111:7 › SPEC-PD-010: the base map › I8: a map made in the dark them |
| m033 | map/createPhotoMap.ts:284 | e2e: selection.spec.ts:33:9 › the selected pin has an accent border › SPEC-PD-011: a clust |
| m035 | map/createPhotoMap.ts:297 | e2e: mapBehaviour.spec.ts:92:7 › the view the map reports › SPEC-PD-002: the map does not  |
| m036 | map/createPhotoMap.ts:300 | e2e: mapPolish.spec.ts:32:7 › SPEC-PD-010: the base map › draws land, parks, water, street |
| m037 | map/createPhotoMap.ts:307 | e2e: noWebgl.spec.ts:6:5 › SPEC-PD-001: a browser without WebGL makes the map reject with  |
| m039 | map/createPhotoMap.ts:313 | e2e: attribution.spec.ts:6:5 › SPEC-PD-004: the attribution stays visible at a narrow widt |
| m041 | map/createPhotoMap.ts:319 | e2e: pagePolish.spec.ts:144:7 › SPEC-PD-012: the map's stage › a narrow layout draws the m |
| m045 | map/createPhotoMap.ts:336 | e2e: mapPolish.spec.ts:87:7 › SPEC-PD-010: the base map › I8: a change made while the map  |
| m046 | map/createPhotoMap.ts:341 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m047 | map/createPhotoMap.ts:342 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m049 | map/createPhotoMap.ts:346 | e2e: mapBehaviour.spec.ts:23:7 › count labels › SPEC-PD-002: labels of clusters that no lo |
| m050 | map/createPhotoMap.ts:346 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m051 | map/createPhotoMap.ts:346 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m052 | map/createPhotoMap.ts:351 | e2e: selection.spec.ts:43:7 › the selected pin has an accent border › SPEC-PD-011: a pin t |
| m053 | map/createPhotoMap.ts:351 | e2e: selection.spec.ts:15:9 › the selected pin has an accent border › SPEC-PD-011: a singl |
| m054 | map/createPhotoMap.ts:356 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m055 | map/createPhotoMap.ts:356 | e2e: mapPolish.spec.ts:415:7 › SPEC-PD-011: a pin is a photo with a count badge › a larger |
| m056 | map/createPhotoMap.ts:357 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m059 | map/createPhotoMap.ts:368 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m060 | map/createPhotoMap.ts:374 | e2e: map.spec.ts:31:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m063 | map/createPhotoMap.ts:389 | e2e: map.spec.ts:69:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m069 | map/createPhotoMap.ts:413 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m070 | map/createPhotoMap.ts:420 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m071 | map/createPhotoMap.ts:421 | e2e: mapPolish.spec.ts:261:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a dr |
| m073 | map/createPhotoMap.ts:426 | e2e: mapPolish.spec.ts:476:7 › SPEC-PD-011: a pin is a photo with a count badge › a thumbn |
| m074 | map/createPhotoMap.ts:417 | e2e: mapPolish.spec.ts:456:7 › SPEC-PD-011: a pin is a photo with a count badge › a thumbn |
| m075 | map/createPhotoMap.ts:416 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m076 | map/createPhotoMap.ts:417 | e2e: map.spec.ts:13:7 › I7: a point lists every photo it stands for and no other › SPEC-PD |
| m077 | map/createPhotoMap.ts:429 | e2e: mapPolish.spec.ts:283:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a cl |
| m079 | map/createPhotoMap.ts:434 | e2e: mapPolish.spec.ts:283:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a cl |
| m080 | map/createPhotoMap.ts:438 | e2e: mapPolish.spec.ts:160:7 › SPEC-PD-011: a pin is a photo with a count badge › side by  |
| m081 | map/createPhotoMap.ts:438 | e2e: mapBehaviour.spec.ts:39:7 › count labels › SPEC-PD-002: new points reach the map, and |
| m082 | map/createPhotoMap.ts:439 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m083 | map/createPhotoMap.ts:439 | e2e: mapPolish.spec.ts:218:7 › SPEC-PD-011: a pin is a photo with a count badge › I9: a pi |
| m084 | map/createPhotoMap.ts:447 | e2e: mapPolish.spec.ts:425:7 › SPEC-PD-011: a pin is a photo with a count badge › panning  |
| m085 | map/createPhotoMap.ts:448 | e2e: mapBehaviour.spec.ts:23:7 › count labels › SPEC-PD-002: labels of clusters that no lo |
| m090 | map/createPhotoMap.ts:460 | e2e: mapPolish.spec.ts:300:7 › SPEC-PD-011: a pin is a photo with a count badge › I10: onl |
| m091 | map/createPhotoMap.ts:460 | e2e: mapPolish.spec.ts:300:7 › SPEC-PD-011: a pin is a photo with a count badge › I10: onl |
| m092 | map/createPhotoMap.ts:460 | e2e: mapPolish.spec.ts:300:7 › SPEC-PD-011: a pin is a photo with a count badge › I10: onl |
| m094 | map/createPhotoMap.ts:464 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m095 | map/createPhotoMap.ts:465 | e2e: mapBehaviour.spec.ts:23:7 › count labels › SPEC-PD-002: labels of clusters that no lo |
| m096 | map/createPhotoMap.ts:465 | e2e: mapPolish.spec.ts:476:7 › SPEC-PD-011: a pin is a photo with a count badge › a thumbn |
| m097 | map/createPhotoMap.ts:472 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m100 | map/createPhotoMap.ts:478 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m101 | map/createPhotoMap.ts:479 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m104 | map/createPhotoMap.ts:491 | e2e: mapPolish.spec.ts:87:7 › SPEC-PD-010: the base map › I8: a change made while the map  |
| m105 | map/createPhotoMap.ts:492 | e2e: mapPolish.spec.ts:56:7 › SPEC-PD-010: the base map › I8: a theme change repaints in t |
| m106 | map/createPhotoMap.ts:496 | e2e: mapPolish.spec.ts:56:7 › SPEC-PD-010: the base map › I8: a theme change repaints in t |
| m107 | map/createPhotoMap.ts:499 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m113 | map/createPhotoMap.ts:521 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m116 | map/createPhotoMap.ts:529 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m117 | map/createPhotoMap.ts:529 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m127 | map/createPhotoMap.ts:556 | e2e: mapBehaviour.spec.ts:69:7 › the view the map reports › SPEC-PD-002: panning and zoomi |
| m130 | map/createPhotoMap.ts:564 | e2e: tileFailure.spec.ts:6:5 › SPEC-PD-001: the notice stays while tiles keep failing, and |
| m134 | map/createPhotoMap.ts:569 | e2e: mapBehaviour.spec.ts:69:7 › the view the map reports › SPEC-PD-002: panning and zoomi |
| m137 | map/createPhotoMap.ts:583 | e2e: mapBehaviour.spec.ts:39:7 › count labels › SPEC-PD-002: new points reach the map, and |
| m138 | map/createPhotoMap.ts:584 | e2e: mapBehaviour.spec.ts:39:7 › count labels › SPEC-PD-002: new points reach the map, and |
| m139 | map/createPhotoMap.ts:585 | e2e: mapPolish.spec.ts:476:7 › SPEC-PD-011: a pin is a photo with a count badge › a thumbn |
| m141 | map/createPhotoMap.ts:587 | e2e: mapBehaviour.spec.ts:39:7 › count labels › SPEC-PD-002: new points reach the map, and |
| m143 | map/createPhotoMap.ts:591 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m144 | map/createPhotoMap.ts:591 | e2e: selection.spec.ts:110:7 › the selected pin has an accent border › SPEC-PD-011: removi |
| m145 | map/createPhotoMap.ts:592 | e2e: mapPolish.spec.ts:366:7 › SPEC-PD-011: a pin is a photo with a count badge › selectin |
| m146 | map/createPhotoMap.ts:595 | e2e: mapPolish.spec.ts:87:7 › SPEC-PD-010: the base map › I8: a change made while the map  |
| m153 | map/createPhotoMap.ts:606 | e2e: mapBehaviour.spec.ts:56:7 › count labels › SPEC-PD-002: removing the map takes its ca |
| n001 | MapView.tsx:310 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n002 | MapView.tsx:310 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n004 | MapView.tsx:270 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n005 | MapView.tsx:275 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n006 | MapView.tsx:275 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n007 | MapView.tsx:273 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n008 | MapView.tsx:277 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n009 | MapView.tsx:272 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n010 | MapView.tsx:282 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n011 | MapView.tsx:282 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n013 | MapView.tsx:311 | e2e: pagePolish.spec.ts:85:7 › SPEC-PD-012: the map's stage › keeps its 24 rem floor on a  |
| n014 | MapView.tsx:311 | e2e: pagePolish.spec.ts:66:7 › SPEC-PD-012: the map's stage › fills the column down to the |
| n016 | MapView.tsx:184 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n017 | MapView.tsx:183 | vitest: PhotoDiaryPage.test.tsx > the open list and the selected point on the map > a rest |
| n019 | MapView.tsx:226 | vitest: PhotoDiaryPage.test.tsx > the open list and the selected point on the map > a clic |
| n020 | MapView.tsx:230 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n021 | MapView.tsx:230 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n022 | MapView.tsx:186 | vitest: PhotoDiaryPage.test.tsx > SPEC-PD-002 / I10: map view > clicking the point whose l |
| n024 | MapView.tsx:351 | vitest: UiPolishStates.test.tsx > SPEC-PD-012: the map's stage, and its inputs while they  |
| n025 | MapView.tsx:41 | e2e: pagePolish.spec.ts:144:7 › SPEC-PD-012: the map's stage › a narrow layout draws the m |
| p001 | usePinned.ts:7 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |
| p002 | usePinned.ts:7 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| p012 | usePinned.ts:37 | e2e: calendarPolish.spec.ts:465:7 › SPEC-PD-009: the calendar column on a wide layout › I5 |
| p016 | usePinned.ts:64 | vitest: DailyNotes.test.tsx > SPEC-PD-006 I4: the mark > a mark comes and goes with the st |
| p017 | usePinned.ts:64 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| p019 | usePinned.ts:64 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| p020 | usePinned.ts:64 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| p022 | usePinned.ts:65 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |
| p023 | usePinned.ts:66 | e2e: calendarPolish.spec.ts:614:7 › SPEC-PD-009: the one-week strip on a narrow layout › t |
| s001 | map/mapStyle.ts:22 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s002 | map/mapStyle.ts:34 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s003 | map/mapStyle.ts:36 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s004 | map/mapStyle.ts:46 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > use a glyph address th |
| s005 | map/mapStyle.ts:48 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > use a glyph address th |
| s006 | map/mapStyle.ts:49 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s007 | map/mapStyle.ts:51 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s008 | map/mapStyle.ts:51 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s009 | map/mapStyle.ts:52 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s010 | map/mapStyle.ts:52 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s011 | map/mapStyle.ts:53 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s012 | map/mapStyle.ts:54 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s013 | map/mapStyle.ts:54 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s014 | map/mapStyle.ts:72 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s015 | map/mapStyle.ts:78 | e2e: mapPolish.spec.ts:32:7 › SPEC-PD-010: the base map › draws land, parks, water, street |
| s016 | map/mapStyle.ts:80 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw only the source l |
| s017 | map/mapStyle.ts:81 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw only the source l |
| s018 | map/mapStyle.ts:86 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s019 | map/mapStyle.ts:87 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s020 | map/mapStyle.ts:93 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s021 | map/mapStyle.ts:96 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s022 | map/mapStyle.ts:96 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s023 | map/mapStyle.ts:102 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s024 | map/mapStyle.ts:104 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s025 | map/mapStyle.ts:110 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s026 | map/mapStyle.ts:112 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s027 | map/mapStyle.ts:118 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s028 | map/mapStyle.ts:119 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s030 | map/mapStyle.ts:124 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw only the source l |
| s031 | map/mapStyle.ts:125 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s032 | map/mapStyle.ts:127 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s033 | map/mapStyle.ts:129 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s034 | map/mapStyle.ts:129 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s035 | map/mapStyle.ts:129 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s037 | map/mapStyle.ts:131 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s038 | map/mapStyle.ts:131 | e2e: mapPolish.spec.ts:32:7 › SPEC-PD-010: the base map › draws land, parks, water, street |
| s040 | map/mapStyle.ts:141 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > take the kinds the spe |
| s041 | map/mapStyle.ts:142 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > have the widths at zoo |
| s042 | map/mapStyle.ts:143 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > draw names in Noto San |
| s043 | map/mapStyle.ts:151 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s044 | map/mapStyle.ts:150 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > carry the palettes' co |
| s045 | map/mapStyle.ts:136 | e2e: mapPolish.spec.ts:111:7 › SPEC-PD-010: the base map › I8: a map made in the dark them |
| s046 | map/mapStyle.ts:161 | vitest: map/mapStyle.test.ts > SPEC-PD-010: the base map's layers > use a glyph address th |
| t001 | lib/steps.ts:5 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t002 | lib/steps.ts:5 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t003 | lib/steps.ts:6 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t004 | lib/steps.ts:6 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t005 | lib/steps.ts:7 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t006 | lib/steps.ts:7 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t007 | lib/steps.ts:8 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| t008 | lib/steps.ts:8 | vitest: UiPolish.test.tsx > SPEC-PD-008 I1: a day's surface step is decided by its count > |
| v001 | DayPreview.tsx:6 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v002 | DayPreview.tsx:7 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v003 | DayPreview.tsx:8 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v004 | DayPreview.tsx:11 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v006 | DayPreview.tsx:11 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v007 | DayPreview.tsx:12 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v008 | DayPreview.tsx:13 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v009 | DayPreview.tsx:14 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v010 | DayPreview.tsx:14 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v011 | DayPreview.tsx:14 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v013 | DayPreview.tsx:16 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v015 | DayPreview.tsx:31 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v017 | DayPreview.tsx:30 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > the preview is decorative and let |
| v018 | DayPreview.tsx:30 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > the preview is decorative and let |
| v019 | DayPreview.tsx:36 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > reads the day photo only after re |
| v020 | DayPreview.tsx:38 | vitest: UiPolishStates.test.tsx > SPEC-PD-008: the preview's inputs while they load or are |
| v021 | DayPreview.tsx:39 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > failure: a preview thumbnail that |
| v022 | DayPreview.tsx:37 | vitest: UiPolish.test.tsx > SPEC-PD-008: hover preview > the preview is decorative and let |
| w001 | WeekStrip.tsx:10 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > gives th |
| w003 | WeekStrip.tsx:45 | e2e: calendarPolish.spec.ts:522:7 › SPEC-PD-009: the one-week strip on a narrow layout › I |
| w004 | WeekStrip.tsx:51 | e2e: calendarPolish.spec.ts:522:7 › SPEC-PD-009: the one-week strip on a narrow layout › I |
| w005 | WeekStrip.tsx:50 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |
| w008 | WeekStrip.tsx:53 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > scrolls  |
| w009 | WeekStrip.tsx:39 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > the back |
| w010 | WeekStrip.tsx:39 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |
| w012 | WeekStrip.tsx:36 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| w014 | WeekStrip.tsx:36 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| w015 | WeekStrip.tsx:37 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| w016 | WeekStrip.tsx:43 | e2e: calendarPolish.spec.ts:507:7 › SPEC-PD-009: the one-week strip on a narrow layout › a |
| w017 | WeekStrip.tsx:44 | vitest: UiPolishStates.test.tsx > SPEC-PD-009: the strip, and what it waits for > is shown |

TOTAL: 24 findings
