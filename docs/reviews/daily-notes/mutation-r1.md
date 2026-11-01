# Mutation review r1: daily notes

- 固定コミット: `eb47c5074378ed257ca3aeb1bf89f1b1d5a5ac38`（`feature/daily-notes`、addon リポジトリ）
- 実行: 変異 222 件（キル 155、生存 67）。生存のうち finding 15 件、残りは等価か、普段の操作で起きないか、見た目だけ（理由は各行）
- ベースライン: vitest 404 件、backend 199 件、e2e（dailyNotes）9 件がすべて通過
- ツリー: 変異とプローブのたびに `git checkout` で復元。最後に `git status` が空で HEAD が固定 SHA のままであることを確認

## 確かめ方

生存した変異は、スイートに残っていないだけで挙動が本当に壊れるのかを確かめるため、テストファイルの末尾に一時的なプローブを足して測った（実行後に復元済み）。プローブは未変異のコードで通り、変異を入れると落ちることを確認している。F と I は依頼の尺度。

## 全体に関わる発見: 3 秒の待ちが 2 回目の読み取りと重なっている

`frontend/src/test/setup.ts` の `asyncUtilTimeout` は 3000 ms で、`SECOND_READ_MS` も 3000 ms。`findBy*` や `waitFor` は待っている間に 2 回目の読み取りを受け取れるので、**本来の経路が壊れていても 2 回目の読み取りが直して緑になる**。

`SECOND_READ_MS` を大きくすると未変異では 4 件とも通り、次の変異で落ちる。

- u09: `with a failed first read`
- u52: `the row has become active`、`Restore answering 404 when the note is already back`
- u59: `a re-read waits while creating`（標準の設定では 4 回中 3 回キル、1 回生存の競合。u80 も同じ）

ページを開いて 3 秒が過ぎたあとには 2 回目の読み取りがないので、利用者には救いがない。これらのテストは 2 回目の読み取りを消化してから操作するか、待ち時間を 3 秒より十分短くする必要がある。

## Findings（生存していて問題になるもの）

| id | 場所 | 不変条件 | 普段の操作で起きる条件と、起きること | F | I | 確認 |
|---|---|---|---|---|---|---|
| u92 | useDayNote.ts:283 | 状態表「Any -> Another day's loading」、I10 | ノートのある日から別の日を押すたび。新しい日の /note が返るまで、新しい日付の見出しの下に前の日の本文と、前の日のファイルへの Edit が出る。LAN では短いが毎回で、回線が遅いと長い。その間に Edit を押すと別の日付を編集する | 8 | 3 | P1 |
| p08 | PhotoList.tsx:113 | I10、以前の spec の復元規則 | 写真から Back で戻ったあと別の日を押す。新しい日にも保存済みの位置が適用され、スクロールが飛ぶ。jsdom でも e2e でも生存 | 5 | 3 | P6 |
| e07 | PhotoDiaryPage.tsx:26 | I3（editor の判定中は出さない）、ドライブ境界 | ページを開いたままドライブを切り替える。`useEditorAvailable` の保持した答えが残り、新しいドライブの policy を読んでいる間、policy off のドライブでも Write が出る。パネル以外の state（months など）も持ち越される。ドライブ変更の再マウントを守るテストがない | 5 | 3 | P11 |
| c28 | CalendarView.tsx:310 | I4、decisions「no count when the day has no photos」 | 写真のない日を開くたび、パネルの見出しに「0枚」が出る。テストはグリッドと月しか見ていない | 8 | 1 | P5 |
| u62 | useDayNote.ts:219 | 「No note request runs while the calendar view is hidden」 | 日を開いて地図タブへ移るたび、/note と stream を読む。画面には出ない。既存のテストは `view=map` で開く場合だけで、そこでは months が null なので id が null になりガードに届かない | 5 | 1 | P7 |
| u12 | useDayNote.ts:110 | 「only the latest applies」、I9 | 再読込が重なり、古い stream の応答が後に届く。新しい本文が古い本文で黙って置き換わり、次の読み取りまで残る。テストは /note の順序だけで、stream の順序は見ていない | 1 | 8 | P2 |
| u03 | useDayNote.ts:78 | I10（離れた日の応答はパネルを変えない） | Restore か Write を押して、応答の前に別の日へ移る。`end()` が離れた日の model を書き戻し、移動先の日のノートと操作が次の読み取りまで消える | 1 | 5 | P10 |
| u52 | useDayNote.ts:189 | 失敗表 409 と Restore の「Any other state is followed」 | ページを開いて 3 秒が過ぎたあと、別タブで書いた日に Write が 409、または別タブで戻した日に Restore が 404 を受ける。active を追うのに本文を読まず、skeleton のまま止まる。2 回目の読み取りがテストを救っている | 1 | 5 | mask |
| u26 | useDayNote.ts:128 | 状態表「failed -> Loading on Retry」 | 写真のある日で state が none / empty / trashed / missing のとき再読込が失敗する（バックエンドの再起動など）。Retry が成功してもロードエラーが消えない | 1 | 3 | P3 |
| u11 | useDayNote.ts:98 | 同上 | u26 と同じ条件で同じ結果。failure の種類が stream になり、128 行目で消えない | 1 | 3 | P3 |
| u31 | useDayNote.ts:137 | 失敗表「Retry reads the stream again」 | stream が 500 を返したあと Retry が成功する。本文は出るが、ロードエラーがその上に残る。テストは本文と読み取り回数しか見ていない | 1 | 3 | P4 |
| u17 | useDayNote.ts:123 | message の寿命「a re-read with a different result」 | 同じ file_id のまま state が変わる。could-not-restore が復元済みのノートの上に残る。stream 404 のあと Retry で missing になると、ロードエラーが missing の行と並んで残る | 1 | 3 | P8, P9 |
| u09 | useDayNote.ts:98 | settled「the first read has failed」、I10 | 写真から Back で戻ったときに /note が失敗する。位置の適用が 3 秒後の読み取りの成功まで遅れ、それも失敗すると適用されない | 1 | 3 | mask |
| b08 | router.py:165 | SPEC-PD-005 `has_note` は `active` で true | ASCII 1 文字だけのノート。/note は active なのにカレンダーにマークが出ない。one-byte のテストは /note にしかない（b29 はキル） | 1 | 3 | 変異で自明 |
| c18 | CalendarView.tsx:106 | I3（missing は月を出さない） | stream 404 のあと Retry で missing を見つける。そのノートだけの月が次の読み取りまで月ピッカーに残る。テストは日のマークだけ見ている | 1 | 1 | P12 |

`rules/agents.md` の修正基準（F×I が 15 以上、または F が 1 以上で I が 8 以上）に届くのは **u92、p08、e07、u12** の 4 件。c28 と u62 は点数は低いが、spec が明記した規則を破っている。

## 記録しておくこと

- **a04 の測定（`cache: "no-cache"` の除去が生存）。** テストは指定を検査していない。ただし core の stream は小さなテキストに ETag だけを返し、Last-Modified を返さない。同じヘッダーを返すローカルサーバーを Playwright の Chromium と WebKit から既定の fetch で 2 回読むと、1.5 秒後でも両方サーバーに届き、新しい本文が返った。したがって今の core では観測できず、finding にしていない。core が Last-Modified を返すようになると、この指定だけが I9 を守る。実機の iOS と、`_TEXT_WRITE_MAX_BYTES` を超えるノートは未測定。
- **e2e で確認したもの。** p05、p06、p08、n17、c03、a04 は e2e（dailyNotes）でも生存。p01 は e2e でも 2 件落ちる。
- **偶発的なキル。** p03 は前のテストの rAF が次のテストへ漏れて落ちている（3 回とも再現）。キル扱いだが、rAF のキャンセルを直接確かめるテストではない。
- **作り直した変異。** c16 は `() => {}` のままだと再読込の無限ループになり、テストの判定にならない。安定した no-op で再実行してキルを確認した。
- **読んでいて気づいたが、未測定。** u43 の行の経路（stream 404 のあと /note も失敗）は、未変異のコードでも settled にならないように読める。finding には数えていない。

## 全行

「killed」の欄は最初に落ちたテスト（`--bail=1`）。生存の行は理由か FINDING を示す。

| id | file:line | 変更 | 結果 | 落としたテスト / 生存の理由 |
|---|---|---|---|---|
| b01 | backend/router.py:147 | `"Photo Diary"` -> `"Photo diary"` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[zero-bytes] |
| b02 | backend/router.py:163 | `File.file_path.op("GLOB")(_note_path(glob_date))` -> `func.lower(File.file_path).op("GLOB")(_note_path(glob_date).lower())` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i1_a_file_not_exactly_at_the_note_path_is_no_note[folder-other-case] |
| b03 | backend/router.py:163 | `File.file_path.op("GLOB")(_note_path(glob_date))` -> `File.file_path.op("GLOB")(f"{_NOTE_PREFIX}{glob_date}*")` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i1_a_file_not_exactly_at_the_note_path_is_no_note[suffix] |
| b04 | backend/router.py:163 | `File.file_path.op("GLOB")(_note_path(glob_date))` -> `File.file_path.op("GLOB")("*" + _note_path(glob_date))` | survived | 等価。別フォルダの行は _NOTE_DATE が日付にならず、real-date 条件が落とす（テストの nested-note-folder が通る） |
| b05 | backend/router.py:163 | `File.file_path.op("GLOB")(_note_path(glob_date))` -> `File.file_path.op("GLOB")(f"{_NOTE_PREFIX}*{glob_date}.md")` | survived | 等価。b04 と同じ |
| b06 | backend/router.py:164 | `active_file_filter(),` -> `(除去)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i3_a_row_that_is_not_a_note_gives_no_mark_and_no_month[trashed] |
| b07 | backend/router.py:165 | `File.file_size > 0,` -> `(除去)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i3_a_row_that_is_not_a_note_gives_no_mark_and_no_month[empty] |
| b08 | backend/router.py:165 | `File.file_size > 0,` -> `File.file_size > 1,` | survived | **FINDING**（下記） |
| b09 | backend/router.py:166 | `func.date(_NOTE_DATE) == _NOTE_DATE,` -> `(除去)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i1_a_note_path_for_a_non_real_date_is_no_note[feb-30] |
| b10 | backend/router.py:167 | `_NOTE_DATE >= "0001-01-01",` -> `(除去)` | survived | F0。`0000-01-01.md` というファイルが必要 |
| b11 | backend/router.py:162 | `File.drive == drive,` -> `(除去)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i2_a_note_is_reported_only_on_its_own_drive |
| b12 | backend/router.py:182 | `counts.setdefault(note_month, 0)` -> `counts[note_month] = 0` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i4_a_note_changes_no_photo_count_and_no_photo_route |
| b13 | backend/router.py:185 | `sorted(counts, reverse=True)` -> `sorted(counts)` | killed | addons/photo_diary-src/tests/test_calendar.py::test_pd001_months_newest_first_with_counts |
| b14 | backend/router.py:207 | `sorted(counts.keys() \| noted)` -> `sorted(counts.keys() \| noted, reverse=True)` | killed | addons/photo_diary-src/tests/test_calendar.py::test_pd001_days_oldest_first_only_days_with_photos |
| b15 | backend/router.py:207 | `sorted(counts.keys() \| noted)` -> `sorted(counts.keys())` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_a_real_date_is_a_note_at_the_month_boundaries[leap-day] |
| b16 | backend/router.py:206 | `has_note=d in noted` -> `has_note=True` | killed | addons/photo_diary-src/tests/test_calendar.py::test_pd001_days_oldest_first_only_days_with_photos |
| b17 | backend/router.py:206 | `counts.get(d, 0)` -> `counts.get(d, 1)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_a_real_date_is_a_note_at_the_month_boundaries[leap-day] |
| b18 | backend/router.py:203 | `_note_dates(drive, f"{month}-[0-9][0-9]")` -> `_note_dates(drive)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_the_date_comes_only_from_the_name |
| b19 | backend/router.py:182 | `counts.setdefault(note_month, 0)` -> `pass` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_a_real_date_is_a_note_at_the_month_boundaries[leap-day] |
| b20 | backend/router.py:230 | `File.drive == drive, File.file_path == _note_path(_real_date(date))` -> `File.file_path == _note_path(_real_date(date))` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i2_a_note_is_reported_only_on_its_own_drive |
| b21 | backend/router.py:230 | `File.drive == drive, File.file_path == _note_path(_real_date(date))` -> `File.drive == drive, File.file_path.ilike(_note_path(_real_date(date)))` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_i1_a_file_not_exactly_at_the_note_path_is_no_note[folder-other-case] |
| b22 | backend/router.py:230 | `File.drive == drive, File.file_path == _note_path(_real_date(date))` -> `File.drive == drive, File.file_path == _note_path(date)` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_bad_input_is_422[note-feb-30] |
| b23 | backend/router.py:213 | `if _DATE_RE.match(value):` -> `if True:` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_bad_input_is_422[note-no-dashes] |
| b24 | backend/router.py:215 | `calendar_date.fromisoformat(value)` -> `pass` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_bad_input_is_422[note-feb-30] |
| b25 | backend/router.py:234 | `file_id=None` -> `file_id="x"` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_no_row_is_none_with_a_null_id |
| b26 | backend/router.py:236 | `if deleted_at is not None:` -> `if False:` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[trashed-with-text] |
| b27 | backend/router.py:238 | `elif missing_since is not None:` -> `elif False:` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[missing-with-text] |
| b28 | backend/router.py:241 | `size > 0` -> `size >= 0` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[zero-bytes] |
| b29 | backend/router.py:241 | `size > 0` -> `size > 1` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[one-byte] |
| b30 | backend/router.py:242 | `file_id=file_id` -> `file_id=file_id if state == "active" else None` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_note_state_and_id[zero-bytes] |
| b31 | backend/router.py:225 | `drive: str = Depends(_drive_scope),` -> `drive: str = Header(alias="X-Lit-Drive"),` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_missing_drive_header_is_400[/note?date=2026-10-03] |
| b32 | backend/router.py:173 | `drive: str = Depends(_drive_scope)` -> `drive: str = Header(alias="X-Lit-Drive")` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_missing_drive_header_is_400[/calendar/months] |
| b33 | backend/router.py:193 | `drive: str = Depends(_drive_scope),` -> `drive: str = Header(alias="X-Lit-Drive"),` | killed | addons/photo_diary-src/tests/test_authorization.py::test_pd003_missing_drive_header_is_400[/calendar/days?month=2026-10] |
| b34 | backend/router.py:137 | `File.file_type == "image",` -> `(除去)` | killed | addons/photo_diary-src/tests/test_calendar.py::test_i4_trashed_missing_and_non_image_are_excluded |
| b35 | backend/router.py:150 | `len(_NOTE_PREFIX) + 1` -> `len(_NOTE_PREFIX)` | killed | addons/photo_diary-src/tests/test_daily_notes.py::test_pd005_a_real_date_is_a_note_at_the_month_boundaries[leap-day] |
| b36 | backend/router.py:180 | `.distinct()` -> `(除去)` | survived | 等価。setdefault なので重複しても結果は同じ |
| u01 | frontend/useDayNote.ts:69 | `if (visit.current.id !== id) visit.current = { id, scope: { date } };` -> `(除去)` | killed | SPEC-PD-006: every day is a button a day with neither photos nor a note is named by its date, and pressing it opens its panel with a history entry |
| u02 | frontend/useDayNote.ts:67 | ``${drive}\n${date}`` -> ``${date}`` | survived | 単独では等価。`Session key={drive}` がドライブ変更で再マウントする。x01 参照 |
| u03 | frontend/useDayNote.ts:78 | `if (live.current !== s) return;` -> `(除去)` | survived | **FINDING**（下記） |
| u04 | frontend/useDayNote.ts:94 | `seq === noteSeq.current && live.current === s ? info : null` -> `live.current === s ? info : null` | killed | SPEC-PD-006 I10: a day or drive the viewer has left of two reads of one day, only the latest applies |
| u05 | frontend/useDayNote.ts:94 | `seq === noteSeq.current && live.current === s ? info : null` -> `seq === noteSeq.current ? info : null` | survived | 表示は等価。commit のガードが止める。閉じた日の本文を1回余分に読むだけ |
| u06 | frontend/useDayNote.ts:96 | `if (seq !== noteSeq.current \|\| live.current !== s) return null;` -> `if (live.current !== s) return null;` | survived | F0。古い /note の失敗が新しい読み取りの成功より後に届く必要がある。Retry で消える |
| u07 | frontend/useDayNote.ts:96 | `if (seq !== noteSeq.current \|\| live.current !== s) return null;` -> `if (seq !== noteSeq.current) return null;` | survived | F0。新しい日へ移れば seq が止める。残るのはパネルを閉じた直後の 404 だけで、その 404 はどのルートでも同じ |
| u08 | frontend/useDayNote.ts:97 | `if (isNotFound(error)) onNotAvailable();` -> `if (false) onNotAvailable();` | killed | SPEC-PD-007 I3 I7: a trashed note Restore failing, then /note answering 404, is not-available |
| u09 | frontend/useDayNote.ts:98 | `modelOf(model, s).settled \|\| modelOf(model, s).info === null` -> `modelOf(model, s).settled` | survived | **FINDING**（下記） |
| u10 | frontend/useDayNote.ts:98 | `modelOf(model, s).settled \|\| modelOf(model, s).info === null` -> `true` | survived | F0。本文の読み込み中に再読込が失敗した場合だけ、スクロール適用が早まる |
| u11 | frontend/useDayNote.ts:98 | `failure: "note"` -> `failure: "stream"` | survived | **FINDING**（下記） |
| u12 | frontend/useDayNote.ts:110 | `seq === textSeq.current && live.current === s ? { text } : null` -> `live.current === s ? { text } : null` | survived | **FINDING**（下記） |
| u13 | frontend/useDayNote.ts:110 | `seq === textSeq.current && live.current === s ? { text } : null` -> `seq === textSeq.current ? { text } : null` | survived | 表示は等価。commit のガードが止める |
| u14 | frontend/useDayNote.ts:112 | `if (seq !== textSeq.current \|\| live.current !== s) return null;` -> `if (live.current !== s) return null;` | survived | F0。古い stream の失敗が新しい成功より後に届く必要がある。Retry で消える |
| u15 | frontend/useDayNote.ts:112 | `if (seq !== textSeq.current \|\| live.current !== s) return null;` -> `if (seq !== textSeq.current) return null;` | survived | F0。離れた日の stream 404 が移動先の /note の読み取り中に届く必要がある |
| u16 | frontend/useDayNote.ts:113 | `error instanceof ApiError ? error.status : 0` -> `0` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u17 | frontend/useDayNote.ts:123 | `before.info === null \|\| before.info.state !== info.state \|\| before.info.file_id !== info.file_id` -> `before.info === null \|\| before.info.file_id !== info.file_id` | survived | **FINDING**（下記） |
| u18 | frontend/useDayNote.ts:123 | `before.info === null \|\| before.info.state !== info.state \|\| before.info.file_id !== info.file_id` -> `before.info === null \|\| before.info.state !== info.state` | survived | F0。同じ日付で file_id だけ変わる（削除と再作成）必要があり、その場合も本文は次の読み取りで置き換わる |
| u19 | frontend/useDayNote.ts:123 | `before.info === null \|\| before.info.state !== info.state \|\| before.info.file_id !== info.file_id` -> `before.info !== null && (before.info.state !== info.state \|\| before.info.file_id !== info.file_id)` | survived | 等価。blank の model は text / message が null で、"note" の failure は 128 行目が消す |
| u20 | frontend/useDayNote.ts:124 | `if (before.info !== null && before.info.state !== info.state) onStateChanged();` -> `if (before.info !== null) onStateChanged();` | killed | SPEC-PD-006 failure cases: the stream Retry that finds the same state does not read the calendar again |
| u21 | frontend/useDayNote.ts:124 | `if (before.info !== null && before.info.state !== info.state) onStateChanged();` -> `(除去)` | killed | SPEC-PD-006 failure cases: the stream Retry that finds the row missing shows it in the panel and drops the mark from the grid |
| u22 | frontend/useDayNote.ts:124 | `if (before.info !== null && before.info.state !== info.state) onStateChanged();` -> `if (before.info?.state !== info.state) onStateChanged();` | killed | loading and refetching states of what a decision uses while a month's days are loading the grid has no day buttons, and the open day's list still loads |
| u23 | frontend/useDayNote.ts:127 | `{ text: null, message: null, failure: null }` -> `{ message: null, failure: null }` | survived | 無害。本文は active でしか描かれず、次の本文で置き換わる。empty から active に戻るときに古い本文が数 ms 見えるだけ |
| u24 | frontend/useDayNote.ts:127 | `{ text: null, message: null, failure: null }` -> `{ text: null, failure: null }` | killed | SPEC-PD-007 I6: creation answering 409 the rescan message goes on a re-read with a different result |
| u25 | frontend/useDayNote.ts:127 | `{ text: null, message: null, failure: null }` -> `{ text: null, message: null }` | killed | SPEC-PD-005 failure cases: /note 500 on a first read shows the load error; photos stay; no control until Retry reads /note again |
| u26 | frontend/useDayNote.ts:128 | `...(!changed && before.failure === "note" ? { failure: null } : {}),` -> `(除去)` | survived | **FINDING**（下記） |
| u27 | frontend/useDayNote.ts:128 | `...(!changed && before.failure === "note" ? { failure: null } : {}),` -> `...(!changed ? { failure: null } : {}),` | survived | 一時的なちらつきのみ。本文の読み込み後は同じ状態に落ち着く |
| u28 | frontend/useDayNote.ts:129 | `settled: before.settled \|\| info.state !== "active",` -> `settled: true,` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with a note: applied only once the text is rendered |
| u29 | frontend/useDayNote.ts:129 | `settled: before.settled \|\| info.state !== "active",` -> `settled: before.settled,` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with no note: applied once the state is known |
| u30 | frontend/useDayNote.ts:129 | `settled: before.settled \|\| info.state !== "active",` -> `settled: info.state !== "active",` | survived | 無害。settled は未適用の復元にしか効かず、適用後の false は参照されない |
| u31 | frontend/useDayNote.ts:137 | `{ text: result.text, failure: null, settled: true }` -> `{ text: result.text, settled: true }` | survived | **FINDING**（下記） |
| u32 | frontend/useDayNote.ts:137 | `{ text: result.text, failure: null, settled: true }` -> `{ text: result.text, failure: null }` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with a note: applied only once the text is rendered |
| u33 | frontend/useDayNote.ts:138 | `"stream", settled: true` -> `"stream"` | killed | the saved scroll position when the first read of the stream fails is applied once it has failed with 500 |
| u34 | frontend/useDayNote.ts:138 | `failure: GONE.has(result.status) ? "gone" : "stream"` -> `failure: "stream"` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u35 | frontend/useDayNote.ts:138 | `failure: GONE.has(result.status) ? "gone" : "stream"` -> `failure: "gone"` | killed | SPEC-PD-006 failure cases: the stream another failure shows the load error, and Retry reads only the stream |
| u36 | frontend/useDayNote.ts:41 | `new Set([404, 410])` -> `new Set([404])` | killed | SPEC-PD-006 failure cases: the stream 410 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u37 | frontend/useDayNote.ts:41 | `new Set([404, 410])` -> `new Set([410])` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u38 | frontend/useDayNote.ts:152 | `if (info.state !== "active" \|\| info.file_id === null) return;` -> `if (info.file_id === null) return;` | killed | SPEC-PD-006 I9: the note in the panel empty reads no text, and offers the write control and no Edit |
| u39 | frontend/useDayNote.ts:155 | `mayRecheck && "status" in result && GONE.has(result.status)` -> `"status" in result && GONE.has(result.status)` | killed | SPEC-PD-006 failure cases: the stream Retry after 404 with the stream still answering it reads /note and the stream once each |
| u40 | frontend/useDayNote.ts:155 | `mayRecheck && "status" in result && GONE.has(result.status)` -> `mayRecheck && "status" in result` | killed | SPEC-PD-006 failure cases: the stream another failure shows the load error, and Retry reads only the stream |
| u41 | frontend/useDayNote.ts:155 | `mayRecheck && "status" in result && GONE.has(result.status)` -> `false` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u42 | frontend/useDayNote.ts:156 | `mayRecheck = false;` -> `(除去)` | survived | F0。state か id が変わり続けない限りループしない |
| u43 | frontend/useDayNote.ts:158 | `if (again === null) return;` -> `if (again === null) { showText(s, result); return; }` | survived | F0。stream 404 と /note 失敗が同時に起きる必要がある。Retry の経路はどちらも同じ |
| u44 | frontend/useDayNote.ts:159 | `again.state !== "active" \|\| again.file_id !== info.file_id` -> `again.file_id !== info.file_id` | killed | SPEC-PD-006 failure cases: the stream 404 where the row has become trashed follows the new state |
| u45 | frontend/useDayNote.ts:159 | `again.state !== "active" \|\| again.file_id !== info.file_id` -> `again.state !== "active"` | survived | F0。u18 と同じ条件 |
| u46 | frontend/useDayNote.ts:172 | `recheck = true` -> `recheck = false` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| u48 | frontend/useDayNote.ts:185 | `info.state === still` -> `true` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 when the note is already back follows the state |
| u49 | frontend/useDayNote.ts:185 | `info.state === still` -> `false` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| u50 | frontend/useDayNote.ts:186 | `follow(s, info);` -> `(除去)` | survived | F0。state が同じなので follow の効果は "note" failure を消すことだけ |
| u51 | frontend/useDayNote.ts:187 | `commit(s, { message });` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| u52 | frontend/useDayNote.ts:189 | `await settle(s, info, true);` -> `follow(s, info);` | survived | **FINDING**（下記） |
| u53 | frontend/useDayNote.ts:189 | `await settle(s, info, true);` -> `await settle(s, info, false);` | survived | F0。409 の直後に行が active になり、さらに stream が 404 を返す必要がある |
| u54 | frontend/useDayNote.ts:197 | `if (live.current !== s \|\| busyScope.current === s) return false;` -> `if (live.current !== s) return false;` | survived | UI では等価。ボタンの disabled が同期で反映される（n22 / n23 はキル） |
| u55 | frontend/useDayNote.ts:199 | `{ busy: true, message: null }` -> `{ message: null }` | killed | SPEC-PD-007 I5: Write a note while creating, the control is disabled, so a second press sends nothing |
| u56 | frontend/useDayNote.ts:199 | `{ busy: true, message: null }` -> `{ busy: true }` | killed | SPEC-PD-007 I3 I7: a trashed note the message lasts until the next press, and that press can succeed |
| u57 | frontend/useDayNote.ts:213 | `if (waiting && readQueued) void read(s);` -> `if (readQueued) void read(s);` | survived | 表示は等価。失敗した write の後に /note を1回余分に読むだけ |
| u58 | frontend/useDayNote.ts:213 | `if (waiting && readQueued) void read(s);` -> `if (waiting) void read(s);` | survived | 表示は等価。読み取りが2本走り、noteSeq が古い方を捨てる |
| u59 | frontend/useDayNote.ts:213 | `if (waiting && readQueued) void read(s);` -> `(除去)` | killed | a re-read waits while creating（競合: 4回中3回キル、1回生存） |
| u60 | frontend/useDayNote.ts:212 | `commit(s, { busy: false });` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| u61 | frontend/useDayNote.ts:210 | `if (busyScope.current === s) busyScope.current = null;` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note Restore calls the core with that date's id, and the note, its mark and its month come back without a reload |
| u62 | frontend/useDayNote.ts:219 | `if (id === null \|\| !active) return;` -> `if (id === null) return;` | survived | **FINDING**（下記） |
| u63 | frontend/useDayNote.ts:219 | `if (id === null \|\| !active) return;` -> `if (!active) return;` | survived | 等価。readNote が date null で何もしない |
| u64 | frontend/useDayNote.ts:220 | `if (busyScope.current === live.current) {` -> `if (false) {` | killed | SPEC-PD-007 I5: Write a note a re-read waits while creating |
| u65 | frontend/useDayNote.ts:225 | `[id, active, token, read]` -> `[id, active, read]` | killed | SPEC-PD-006 I4: the mark a mark comes and goes with the state on onRefresh: a note emptied loses it and is offered for writing again |
| u66 | frontend/useDayNote.ts:225 | `[id, active, token, read]` -> `[id, token, read]` | killed | SPEC-PD-006 I10: re-reads entering the calendar view reads again, and what is drawn stays meanwhile |
| u67 | frontend/useDayNote.ts:225 | `[id, active, token, read]` -> `[active, token, read]` | killed | SPEC-PD-006: every day is a button a day with neither photos nor a note is named by its date, and pressing it opens its panel with a history entry |
| u68 | frontend/useDayNote.ts:231 | `info.state === "empty"` -> `false` | killed | SPEC-PD-007 I5: Write a note in state empty, the press sends no write and opens that date's own file |
| u69 | frontend/useDayNote.ts:42 | `?edit=1` -> `(除去)` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| u70 | frontend/useDayNote.ts:237 | `createNote(drive, s.date)` -> `createNote(drive, new Date().toISOString().slice(0, 10))` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| u71 | frontend/useDayNote.ts:235 | `info.state !== "none" \|\| !begin(s)` -> `!begin(s)` | survived | UI では等価。canWrite が none / empty にしか出さず、empty は先に分岐する |
| u72 | frontend/useDayNote.ts:238 | `if (live.current !== s) end(s, false);` -> `if (false) end(s, false);` | killed | SPEC-PD-006 I10: a day or drive the viewer has left a creation answered after leaving the day does not navigate |
| u73 | frontend/useDayNote.ts:239 | `editorHref(created.id)` -> `editorHref(info.file_id)` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| u74 | frontend/useDayNote.ts:242 | `if (live.current !== s) end(s, false);` -> `if (false) end(s, false);` | survived | F0。Write を押して POST の応答前に別の日へ移り、かつ POST が失敗する必要がある |
| u75 | frontend/useDayNote.ts:243 | `else if (status === 404) {` -> `else if (false) {` | killed | SPEC-PD-007: creation failing another way 404 is not-available |
| u76 | frontend/useDayNote.ts:246 | `else if (status === 409) {` -> `else if (false) {` | killed | SPEC-PD-007 I6: creation answering 409 still none: the rescan message, the control stays, the page stays, and no other request writes |
| u77 | frontend/useDayNote.ts:248 | `"rescan"` -> `"start"` | killed | SPEC-PD-007 I6: creation answering 409 still none: the rescan message, the control stays, the page stays, and no other request writes |
| u78 | frontend/useDayNote.ts:248 | `await afterFailure(s, "none", "rescan");` -> `commit(s, { message: "rescan" });` | killed | SPEC-PD-007 I6: creation answering 409 still none: the rescan message, the control stays, the page stays, and no other request writes |
| u79 | frontend/useDayNote.ts:250 | `commit(s, { message: "start" });` -> `(除去)` | killed | SPEC-PD-007: creation failing another way 500: the panel stays with the message, and the control can be pressed again |
| u80 | frontend/useDayNote.ts:251 | `end(s, true);` -> `end(s, false);` | killed | a re-read waits while creating（u59 と同じ競合） |
| u81 | frontend/useDayNote.ts:247 | `end(s, false);` -> `end(s, true);` | survived | 表示は等価。u58 と同じ |
| u82 | frontend/useDayNote.ts:264 | `restored = false;` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| u83 | frontend/useDayNote.ts:267 | `if (live.current !== s) return;` -> `(除去)` | killed | SPEC-PD-006 I10: a day or drive the viewer has left a restore answered after leaving the day leaves no message and no refresh of its panel |
| u84 | frontend/useDayNote.ts:268 | `if (restored) refresh();` -> `if (restored) await read(s);` | survived | 利用者には等価。state の変化で onStateChanged がカレンダーを読み直す。ノートは写真ではないので一覧も変わらない |
| u85 | frontend/useDayNote.ts:269 | `else await afterFailure(s, "trashed", "restoreFailed");` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| u86 | frontend/useDayNote.ts:266 | `end(s, false);` -> `end(s, true);` | survived | 表示は等価。restore の前後で読み取りが2本になるだけ |
| u88 | frontend/useDayNote.ts:275 | `failure === "stream" && info?.state === "active" && info.file_id !== null` -> `false` | killed | SPEC-PD-006 failure cases: the stream another failure shows the load error, and Retry reads only the stream |
| u89 | frontend/useDayNote.ts:275 | `failure === "stream" && info?.state === "active" && info.file_id !== null` -> `(failure === "stream" \|\| failure === "gone") && info?.state === "active" && info.file_id !== null` | killed | SPEC-PD-006 failure cases: the stream Retry after 404 reads /note and the stream once each |
| u90 | frontend/useDayNote.ts:279 | `read(s, false)` -> `read(s, true)` | killed | SPEC-PD-006 failure cases: the stream Retry after 404 with the stream still answering it reads /note and the stream once each |
| u91 | frontend/useDayNote.ts:277 | `if (result !== null) showText(s, result);` -> `(除去)` | killed | SPEC-PD-006 failure cases: the stream another failure shows the load error, and Retry reads only the stream |
| u92 | frontend/useDayNote.ts:283 | `shown.scope === scope ? shown : blank(scope)` -> `shown` | survived | **FINDING**（下記） |
| u93 | frontend/useDayNote.ts:39 | `ref.current.scope === s ? ref.current : blank(s)` -> `ref.current` | killed | SPEC-PD-006: every day is a button pressing a day with a note reads that date's note |
| u94 | frontend/useDayNote.ts:127 | `...(changed ? { text: null` -> `...(true ? { text: null` | killed | SPEC-PD-006 I10: re-reads over a drawn note, a pending /note and a pending stream collapse nothing (ほか5件) |
| a01 | frontend/api.ts:61 | `content: ""` -> `content: " "` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| a02 | frontend/api.ts:61 | `, conflict_mode: "error"` -> `(除去)` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| a03 | frontend/api.ts:61 | `${date}.md` -> `${date}.MD` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| a04 | frontend/api.ts:52 | `{ cache: "no-cache" }` -> `{}` | survived | 測定の結果、観測できない。下記「a04 の測定」参照 |
| a05 | frontend/api.ts:45 | `credentials: "include",` -> `(除去)` | survived | 等価。同一オリジンの fetch は既定で Cookie を送る |
| a06 | frontend/api.ts:58 | `encodeURIComponent(drive)` -> `drive` | survived | F0。fetch が空白と非 ASCII を符号化するので結果は同じ。`#` `?` `%` を含むドライブ名でだけ壊れる。テスト「the drive in the URL is percent-encoded」はこの差を検出しない |
| a07 | frontend/api.ts:52 | `encodeURIComponent(fileId)` -> `fileId` | survived | 等価。file_id は URL 安全な 12 文字 |
| a08 | frontend/api.ts:46 | `if (!response.ok) throw new ApiError(response.status);` -> `(除去)` | killed | SPEC-PD-007 I5: Write a note a re-read waits while creating |
| a09 | frontend/api.ts:67 | `{ method: "POST" }` -> `{ method: "GET" }` | killed | SPEC-PD-007 I3 I7: a trashed note Restore calls the core with that date's id, and the note, its mark and its month come back without a reload |
| c01 | frontend/CalendarView.tsx:28 | `SECOND_READ_MS = 3000` -> `SECOND_READ_MS = 1000` | killed | SPEC-PD-007 I7: coming back from the editor by Back a save the first read overtook appears at the second read, 3 seconds later, without a reload |
| c02 | frontend/CalendarView.tsx:28 | `SECOND_READ_MS = 3000` -> `SECOND_READ_MS = 6000` | killed | SPEC-PD-007 I7: coming back from the editor by Back a save the first read overtook appears at the second read, 3 seconds later, without a reload |
| c03 | frontend/CalendarView.tsx:184 | `setSecondReadDue(false);` -> `(除去)` | survived | ほぼ等価。effect の deps が変わらないのでタイマーは再設定されない。地図とカレンダーを往復すると3秒後の読み取りが再び走るだけ（F3 / I1） |
| c04 | frontend/CalendarView.tsx:180 | `useState(url.date !== null)` -> `useState(true)` | killed | the second read 3 seconds later runs on any entry to the page with a day open not when the page was entered with no day open and a day is pressed later |
| c05 | frontend/CalendarView.tsx:180 | `useState(url.date !== null)` -> `useState(false)` | killed | SPEC-PD-007 I7: coming back from the editor by Back a save the first read overtook appears at the second read, 3 seconds later, without a reload |
| c06 | frontend/CalendarView.tsx:182 | `if (!active \|\| !secondReadDue) return;` -> `if (!secondReadDue) return;` | survived | F0（I7 に対して）。view=map で開いて3秒以上たってからカレンダーへ入ると2回目の読み取りが失われるが、エディタからの戻りはこの経路を通らない |
| c07 | frontend/CalendarView.tsx:185 | `refresh();` -> `(除去)` | killed | SPEC-PD-007 I7: coming back from the editor by Back a save the first read overtook appears at the second read, 3 seconds later, without a reload |
| c08 | frontend/CalendarView.tsx:187 | `return () => clearTimeout(timer);` -> `(除去)` | survived | 無害。入り直しのときに必ず読むので、失われた2回目の読み取りの影響が残らない |
| c09 | frontend/CalendarView.tsx:192 | `if (url.date !== today) go(` -> `go(` | killed | SPEC-PD-007 I8: the Today control does nothing when the date is already today |
| c10 | frontend/CalendarView.tsx:191 | `localToday()` -> `new Date().toISOString().slice(0, 10)` | killed | SPEC-PD-007 I8: the Today control I8: goes to the browser's local date ahead of UTC |
| c11 | frontend/CalendarView.tsx:192 | `go("push"` -> `go("replace"` | killed | SPEC-PD-007 I8: the Today control I8: goes to the browser's local date ahead of UTC |
| c12 | frontend/CalendarView.tsx:192 | `month: today.slice(0, 7), date: today` -> `date: today` | killed | SPEC-PD-007 I8: the Today control I8: goes to the browser's local date ahead of UTC |
| c13 | frontend/CalendarView.tsx:173 | `active,` -> `active: true,` | killed | SPEC-PD-006 I10: re-reads entering the calendar view reads again, and what is drawn stays meanwhile |
| c14 | frontend/CalendarView.tsx:174 | `token,` -> `token: 0,` | killed | SPEC-PD-006 I4: the mark a mark comes and goes with the state on onRefresh: a note emptied loses it and is offered for writing again |
| c16 | frontend/CalendarView.tsx:176 | `onStateChanged: refreshCalendar,` -> `onStateChanged: STABLE_NOOP,` | killed | Retry that finds the row missing shows it in the panel and drops the mark from the grid（安定した no-op で再実行。`() => {}` のままだと毎描画で再読込が無限に回り、スイートが 300 秒で終わらない） |
| c17 | frontend/CalendarView.tsx:106 | `active, token, calendarToken,` -> `active, calendarToken,` | killed | SPEC-PD-001 failure cases: load errors a failed months fetch shows the load error with a retry |
| c18 | frontend/CalendarView.tsx:106 | `active, token, calendarToken,` -> `active, token,` | survived | **FINDING**（下記） |
| c19 | frontend/CalendarView.tsx:129 | `nothingDated, token, calendarToken,` -> `nothingDated, calendarToken,` | killed | SPEC-PD-001 failure cases: load errors a failed days fetch shows the load error with a retry |
| c20 | frontend/CalendarView.tsx:129 | `nothingDated, token, calendarToken,` -> `nothingDated, token,` | killed | SPEC-PD-006 failure cases: the stream Retry that finds the row missing shows it in the panel and drops the mark from the grid |
| c21 | frontend/CalendarView.tsx:109 | `if (!active \|\| month === null \|\| nothingDated) return;` -> `if (!active \|\| month === null) return;` | survived | 表示は等価（NO_DAYS）。days を1回余分に読むだけ |
| c22 | frontend/CalendarView.tsx:166 | `nothingDated ? NO_DAYS : days && days.month === month ? days.byDate : null` -> `days && days.month === month ? days.byDate : null` | killed | SPEC-PD-007 I8: the Today control is there on a drive with nothing dated, and reaches today's month from the message |
| c23 | frontend/CalendarView.tsx:117 | `hasNote: d.has_note === true` -> `hasNote: true` | killed | SPEC-PD-006 I4: the mark a day with neither is quiet, beside a day that has the mark |
| c24 | frontend/CalendarView.tsx:227 | `monthList.length > 0 &&` -> `true &&` | killed | SPEC-PD-001: page URL SPEC-PD-007: a month on a drive with nothing dated is an ordinary grid, previous and next disabled, no picker; undated still opens |
| c25 | frontend/CalendarView.tsx:303 | `listKind === "day" ? note.settled : undefined` -> `note.settled` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area an undated list has nothing to wait for, on a calendar whose days do have notes |
| c26 | frontend/CalendarView.tsx:303 | `listKind === "day" ? note.settled : undefined` -> `undefined` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with a note: applied only once the text is rendered |
| c27 | frontend/CalendarView.tsx:299 | `listKind === "day" ? (` -> `true ? (` | survived | 等価。undated では date が null で、NoteArea は null を返す |
| c28 | frontend/CalendarView.tsx:310 | `total !== null && total > 0 &&` -> `total !== null &&` | survived | **FINDING**（下記） |
| c29 | frontend/CalendarView.tsx:167 | `listKind === "day" ? url.date : null` -> `url.date` | survived | 等価。months が null の間は画面に何も出ず、読み取りが少し早まるだけ |
| c31 | frontend/CalendarView.tsx:300 | `editorAvailable={editorAvailable}` -> `editorAvailable={true}` | killed | SPEC-PD-007 I3: when the editor is not available the knowledge addon is not installed state none offers no write and creates nothing, on a panel that has read its state |
| c34 | frontend/CalendarView.tsx:261 | `if (date !== openDate) go(` -> `go(` | killed | SPEC-PD-001: calendar pressing the day that is already open does nothing |
| c35 | frontend/CalendarView.tsx:164 | `[...monthList].reverse().find((m) => m.month > month)` -> `monthList.find((m) => m.month > month)` | killed | SPEC-PD-001: calendar previous and next skip to the nearest month with photos and are disabled at the ends |
| e01 | frontend/useEditorAvailable.ts:20 | `loading \|\| policy.isLoading ? null` -> `policy.isLoading ? null` | killed | while the editor's availability is being read both are hidden while the list of addons is loading |
| e02 | frontend/useEditorAvailable.ts:20 | `loading \|\| policy.isLoading ? null` -> `loading ? null` | killed | while the editor's availability is being read Write a note is hidden until the policy has answered, then shown |
| e03 | frontend/useEditorAvailable.ts:20 | `"knowledge" in addons && policy.enabled` -> `policy.enabled` | killed | SPEC-PD-007 I3: when the editor is not available the knowledge addon is not installed state none offers no write and creates nothing, on a panel that has read its state |
| e04 | frontend/useEditorAvailable.ts:20 | `"knowledge" in addons && policy.enabled` -> `"knowledge" in addons` | killed | SPEC-PD-007 I3: when the editor is not available its editor policy is off for the drive state none offers no write and creates nothing, on a panel that has read its state |
| e05 | frontend/useEditorAvailable.ts:22 | `answer ?? decided ?? false` -> `answer ?? decided ?? true` | killed | while the editor's availability is being read Write a note is hidden until the policy has answered, then shown |
| e06 | frontend/useEditorAvailable.ts:22 | `answer ?? decided ?? false` -> `answer ?? false` | killed | while the editor's availability is being read a later refetch of the policy does not hide what is shown |
| e07 | frontend/PhotoDiaryPage.tsx:26 | `key={drive}` -> `(除去)` | survived | **FINDING**（下記） |
| g01 | frontend/MonthGrid.tsx:83 | `count > 0 &&` -> `true &&` | killed | SPEC-PD-006 I4: the mark a day with a note and no photos has a mark and shows no count, not even 0 |
| g02 | frontend/MonthGrid.tsx:75 | `{hasNote && (` -> `{true && (` | killed | SPEC-PD-006 I4: the mark a day with neither is quiet, beside a day that has the mark |
| g03 | frontend/MonthGrid.tsx:75 | `{hasNote && (` -> `{false && (` | killed | SPEC-PD-006 I4: the mark a day with a note and no photos has a mark and shows no count, not even 0 |
| g04 | frontend/MonthGrid.tsx:55 | `hasNote && count > 0` -> `false` | killed | SPEC-PD-006 I4: the mark a day with a note and photos has the mark as well as its count |
| g05 | frontend/MonthGrid.tsx:57 | `: hasNote` -> `: false` | killed | SPEC-PD-006: every day is a button pressing a day with a note reads that date's note |
| g06 | frontend/MonthGrid.tsx:59 | `: count > 0` -> `: false` | killed | SPEC-PD-006 I4: the mark a day with neither is quiet, beside a day that has the mark |
| g07 | frontend/MonthGrid.tsx:69 | `count > 0 ? SURFACE.photos : hasNote ? SURFACE.note : SURFACE.quiet` -> `count > 0 ? SURFACE.photos : SURFACE.quiet` | survived | 見た目のみ（F8 / I1）。ノートだけの日の背景。マークとラベルはキル済み |
| g08 | frontend/MonthGrid.tsx:69 | `count > 0 ? SURFACE.photos : hasNote ? SURFACE.note : SURFACE.quiet` -> `hasNote ? SURFACE.note : count > 0 ? SURFACE.photos : SURFACE.quiet` | survived | 見た目のみ（F5 / I1）。写真とノートがある日の背景 |
| g09 | frontend/MonthGrid.tsx:41 | `if (loading) {` -> `if (false) {` | killed | SPEC-PD-006: every day is a button no day is a button while the month's days are loading, and none announces a count |
| g10 | frontend/MonthGrid.tsx:70 | `open ? "border-accent" : "border-transparent"` -> `"border-transparent"` | survived | 見た目のみ（F8 / I1）。開いている日の枠。aria-pressed は残る。以前の spec の範囲 |
| l01 | frontend/lib/dates.ts:60 | `now.getDate()` -> `now.getUTCDate()` | killed | SPEC-PD-007 I8: the Today control I8: goes to the browser's local date ahead of UTC |
| m01 | frontend/MonthPicker.tsx:67 | `count > 0 &&` -> `true &&` | killed | SPEC-PD-006 I4: months with notes and no photos the month picker lists them with no count |
| n01 | frontend/NoteArea.tsx:23 | `showFrontmatter={false}` -> `showFrontmatter={true}` | killed | SPEC-PD-006 I9: the note in the panel the text comes from the core's stream by that date's file id, and goes to the core's preview |
| n02 | frontend/NoteArea.tsx:23 | `chrome={false}` -> `chrome={true}` | killed | SPEC-PD-006 I9: the note in the panel the text comes from the core's stream by that date's file id, and goes to the core's preview |
| n03 | frontend/NoteArea.tsx:23 | `drive={drive} chrome` -> `chrome` | killed | SPEC-PD-006 I9: the note in the panel the text comes from the core's stream by that date's file id, and goes to the core's preview |
| n04 | frontend/NoteArea.tsx:22 | `memo(function` -> `(function` | killed | SPEC-PD-005 failure cases: /note on a re-read, a failure keeps what is drawn with its controls, the error and a retry above it |
| n05 | frontend/NoteArea.tsx:36 | `info === null && failure === null` -> `false` | survived | 些細。空の wrapper の pb-4 だけで、state が来ても同じ wrapper が残る |
| n06 | frontend/NoteArea.tsx:39 | `editorAvailable && state === "active" && (text !== null \|\| failure === "stream")` -> `state === "active" && (text !== null \|\| failure === "stream")` | killed | SPEC-PD-007 I3: when the editor is not available the knowledge addon is not installed a note is still shown, with no Edit link |
| n07 | frontend/NoteArea.tsx:39 | `editorAvailable && state === "active" && (text !== null \|\| failure === "stream")` -> `editorAvailable && (text !== null \|\| failure === "stream")` | survived | 等価。canEdit は state === "active" の枠の中でしか使われない |
| n08 | frontend/NoteArea.tsx:39 | `editorAvailable && state === "active" && (text !== null \|\| failure === "stream")` -> `editorAvailable && state === "active"` | killed | SPEC-PD-006 failure cases: the stream 404 with the row still active reads /note once, then shows the load error with no Edit, and stops |
| n09 | frontend/NoteArea.tsx:39 | `editorAvailable && state === "active" && (text !== null \|\| failure === "stream")` -> `editorAvailable && state === "active" && text !== null` | killed | a first read of the stream failing with 500 still offers Edit, because the state is known to be active |
| n10 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `(state === "none" \|\| state === "empty")` | killed | SPEC-PD-007 I3: when the editor is not available the knowledge addon is not installed state none offers no write and creates nothing, on a panel that has read its state |
| n11 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `editorAvailable && (state === "none" \|\| state === "empty" \|\| state === "trashed")` | killed | SPEC-PD-007 I3 I7: a trashed note says so and offers Restore, no write, no Edit and no text |
| n12 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `editorAvailable && (state === "none" \|\| state === "empty" \|\| state === "missing")` | killed | SPEC-PD-007 I3: a missing note says the file cannot be found and offers no write, Edit or Restore |
| n13 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `editorAvailable && (state === "none" \|\| state === "empty" \|\| state === undefined)` | killed | SPEC-PD-005 failure cases: /note 500 on a first read shows the load error; photos stay; no control until Retry reads /note again |
| n14 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `editorAvailable && state === "none"` | killed | SPEC-PD-006 I4: the mark a mark comes and goes with the state on onRefresh: a note emptied loses it and is offered for writing again |
| n15 | frontend/NoteArea.tsx:40 | `editorAvailable && (state === "none" \|\| state === "empty")` -> `editorAvailable && state === "empty"` | killed | SPEC-PD-007 I5: Write a note in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry |
| n16 | frontend/NoteArea.tsx:44 | `failure !== null &&` -> `false &&` | killed | SPEC-PD-007 I3 I7: a trashed note Restore failing, then /note failing, keeps what is drawn with the load error |
| n17 | frontend/NoteArea.tsx:46 | `state === "active" && text === null && failure === null &&` -> `false &&` | survived | 見た目のみ（F8 / I1）。本文待ちの skeleton が消える。e2e も生存 |
| n18 | frontend/NoteArea.tsx:50 | `state === "active" && (text !== null \|\| canEdit)` -> `(text !== null \|\| canEdit)` | survived | 等価。state が変われば text は null に戻る |
| n20 | frontend/NoteArea.tsx:56 | `?edit=1` -> `(除去)` | killed | SPEC-PD-006 I9: the note in the panel a panel showing a note has Edit, to that date's file, and no write control |
| n21 | frontend/NoteArea.tsx:56 | `${info?.file_id}` -> `x` | killed | SPEC-PD-006 I9: the note in the panel a panel showing a note has Edit, to that date's file, and no write control |
| n22 | frontend/NoteArea.tsx:71 | `disabled={busy}` -> `(除去)` | killed | SPEC-PD-007 I3 I7: a trashed note while restoring the control is disabled, and a re-read waits |
| n23 | frontend/NoteArea.tsx:85 | `disabled={busy}` -> `(除去)` | killed | SPEC-PD-007 I5: Write a note while creating, the control is disabled, so a second press sends nothing |
| n24 | frontend/NoteArea.tsx:91 | `message !== null &&` -> `false &&` | killed | SPEC-PD-007 I3 I7: a trashed note Restore answering 404 while the row is still trashed keeps Restore, with the message; 404 is not not-available |
| n25 | frontend/NoteArea.tsx:67 | `state === "trashed" &&` -> `false &&` | killed | SPEC-PD-007 I3 I7: a trashed note says so and offers Restore, no write, no Edit and no text |
| n26 | frontend/NoteArea.tsx:77 | `state === "missing" &&` -> `false &&` | killed | SPEC-PD-007 I3: a missing note says the file cannot be found and offers no write, Edit or Restore |
| n27 | frontend/NoteArea.tsx:17 | `text-text-muted` -> `text-danger` | survived | 見た目のみ。rescan の色。spec は固定していない |
| p01 | frontend/PhotoList.tsx:105 | `phase !== "ready" \|\| !noteSettled` -> `phase !== "ready"` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with a note: applied only once the text is rendered |
| p02 | frontend/PhotoList.tsx:57 | `noteSettled = true` -> `noteSettled = false` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area an undated list has nothing to wait for, on a calendar whose days do have notes |
| p03 | frontend/PhotoList.tsx:86 | `useEffect(() => () => cancelAnimationFrame(restoreFrame.current), []);` -> `(除去)` | killed | with no note: applied once the state is known（前のテストの rAF が次のテストへ漏れて落ちる偶発的なキル。3回とも再現） |
| p04 | frontend/PhotoList.tsx:114 | `[phase, noteSettled, scroller, onRestored]` -> `[phase, scroller, onRestored]` | killed | SPEC-PD-006 I10: the saved scroll position waits for the note area with a note: applied only once the text is rendered |
| p05 | frontend/PhotoList.tsx:112 | `restoreFrame.current = requestAnimationFrame(apply);` -> `(除去)` | survived | Chromium では等価。apply は片方あれば足りる（e2e 9件すべて通過）。iOS は未測定 |
| p06 | frontend/PhotoList.tsx:111 | `apply();` -> `(除去)` | survived | Chromium では等価。p05 と同じ |
| p07 | frontend/PhotoList.tsx:148 | `{note}` -> `(除去)`; `{phase === "ready" && !empty && children({ files, moreMayFollow })}` -> `{phase === "ready" && !empty && children({ files, moreMayFollow })}{note}` | killed | SPEC-PD-006 I9: the note in the panel the order is the date heading, the note, then the photos |
| p08 | frontend/PhotoList.tsx:113 | `onRestored();` -> `(除去)` | survived | **FINDING**（下記） |
| x01 | frontend/useDayNote.ts:67 | ``${drive}\n${date}`` -> ``${date}``; `key={drive}` -> `(PhotoDiaryPage.tsx でも除去)` | survived | 二重変異（u02 + e07）。普段の操作で両方が同時に外れることはない。ただし I2 のフロント側を、同じ日付のままドライブを切り替えて確かめるテストはない（1570 行のテストは新ドライブの URL に date がない）。e07 の修正でこの穴も塞げる |

TOTAL: 15 findings
