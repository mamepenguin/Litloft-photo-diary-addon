# Photo Diary: ダーク地図をコアの中立色に合わせる

SPEC-ID: SPEC-PD-015

Approval: sha256:70da9a195522e8d04506135b66c615a955906ea441f7041435fdf1d436d31912 Yuichi Senga 2026-11-13

## Summary

コアのダークテーマが赤紫寄りの地色から中立の近黒（`--bg-primary` `#131312`、`--bg-card` `#1c1c1b`）に変わった。Photo Diaryの地図のダーク配色は旧`--bg-card`（`#231216`）を陸地に使い、道路・建物・文字も赤紫寄りの灰色なので、新しいページの中で地図だけが赤く見える。陸地を新しい`--bg-card`に合わせ、陸地との明るさの差を保ったまま中立色にする。ユーザーが2026-11-13にデザイン案 https://claude.ai/artifact/SqxEzgBK1xUpP5ecmjw1HP の案Aを選んだ。

## Required items

### 1. Normal flow

ダークテーマで地図を開くと、次の表の色で描かれる。表にない色（水・河川・森林・公園とそれらの文字色）はdocs/specs/memory-map.md（SPEC-PD-013）の値のまま。ライトテーマは変更しない。

| 用途 | 現在 | 新しい値 |
|---|---|---|
| 陸地 | #231216 | #1C1C1B |
| ハロー | #231216 | #1C1C1B |
| 建物 | #32282A | #30302D |
| 一般道路・細街路 | #3A2E31 | #363633 |
| 幹線道路 | #514449 | #4D4D4A |
| 鉄道 | #7A7373 | #767672 |
| 主要文字 | #CEC7C8 | #CBCBC6 |
| 補助文字 | #9F999B | #9C9C97 |
| 施設文字 | #B8B5B7 | #B7B7B2 |

### 2. Failure cases

変更なし。タイル失敗通知・再読込・サムネイル失敗の表示は既存のまま。

### 3. States

ライト／ダーク、表示中／非表示、テーマ切替の扱いは既存と同じ。ダークに切り替えると上の表の色で再配色される。

### 4. Data read and written

変更なし。

### 5. External services

変更なし。

### 6. Authorization

変更なし。

### 7. Effect on existing features

docs/specs/memory-map.md（SPEC-PD-013）の配色表のダーク列のうち、上の表の9行を置き換える。レイヤー・ズーム条件・線幅・文字サイズ・ライト列・写真ピンとバッジ（`#211922`）は変更しない。カレンダーとパネルはコアのトークンで描かれており、コアの変更にそのまま追従するので触らない。

### 8. Error behavior

変更なし。

### 9. User-visible behavior

ダークテーマの地図の地色・道路・建物・文字が赤みのない灰色になり、周りのページと同じ地色に見える。水と緑の手掛かりは従来どおり。

### 10. Non-functional

色の値だけを変える。依存・通信・描画レイヤーの追加なし。

## Touch points

- frontend/map/mapStyle.ts: `PALETTES.dark`の9値。
- テスト: frontend/map/mapStyle.test.ts、frontend/map/memoryMap.test.ts、e2e/support.ts（`DARK`）、e2e/memoryMap.spec.ts（ダークの建物色）。
- docs/specs/INDEX.md、docs/reviews/neutral-dark-map/（合意したデザイン案の写しを含む）。
- 規則: コアのDESIGN.md（ダークの色トークン）、.claude/rules/frontend-conventions.md、docs/process/testing-and-comments.md。保護パス・設定・APIの変更なし。

## Invariants

I1. ダークテーマの地図の陸地とハローはコアの新しい`--bg-card`（`#1C1C1B`）と同じ色である。

I2. ダークテーマで森林・公園・海・河川は互いに、また陸地と区別できる色で描かれ（SPEC-PD-013 I3）、建物はz14以上でだけ描かれる。

I3. ライトテーマの全色と、両テーマのレイヤー構成・線幅・文字サイズは変わらない。

I4. テーマ切替は地図位置・ズーム・選択中の一覧・読み込み済みタイルを保ったまま全地図色を変える（SPEC-PD-013 I4）。

## Verification

色の値を固定している既存テストの期待値を新しい値に更新し、旧値のままの実装で落ちることを確かめてからGREENにする。vitest・型検査・lintとe2e（Playwright、実ブラウザでの画素計測）を全件実行する。新しいコアのダークテーマの上で地図を表示し、デザイン案との見て分かる差を実装者以外が確認する。

## Checked, no action

- 水・河川・森林・公園とその文字色は承認済みの手掛かりで、新しい陸地の上でも区別できるので据え置く。
- ピンの件数バッジ`#211922`は両テーマ共通の値として承認されており、DESIGN.mdでも現役のライト文字色なので変えない。
- 地図の色をコアのCSS変数から実行時に読む方式にはしない。MapLibreのpaintは文字列の色を要し、テーマ切替の再配色（SPEC-PD-010）の仕組みも変わるため、値の差し替えにとどめる。
- 以前の承認済み仕様自体は編集しない。
