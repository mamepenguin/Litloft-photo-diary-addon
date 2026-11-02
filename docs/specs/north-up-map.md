# Photo Diary: 北を上に固定する

SPEC-ID: SPEC-PD-014

Approval: sha256:6221b89ae46e15c3850ffa1e98976bd38c6b9f9657d71958911d0b00abb12c93 Yuichi Senga 2026-11-02

## Summary

Photo Diaryの地図の向きを北が上の状態に固定する。右ドラッグ・タッチ・キーボードの操作で意図せず回転することを防ぎ、移動とズームは維持する。

## Required items

### 1. Normal flow

地図はbearing 0で開く。マウスの右ボタンドラッグやCtrl付きドラッグ、2本指のひねり、Shift付き左右矢印で方位を変えられない。通常のドラッグ、ホイール、ピンチ、ズームボタン、矢印キーでの移動とキーボードズームは引き続き使える。固定を解除する設定やボタンは追加しない。

### 2. Failure cases

既存のライブラリ・タイル・写真の失敗処理を維持する。向きの固定はMapLibreの標準操作ハンドラーで行い、追加の通信や読み込みを必要としない。

### 3. States

表示中・非表示・復帰・テーマ切替のいずれでも北上固定。地図を作り直すときも固定を適用する。回転可能な状態への遷移は設けない。

### 4. Data read and written

既存の写真・タイル・中心座標・ズームの扱いを維持する。方位の保存値は追加せず、DB・写真・設定ファイルを変更しない。

### 5. External services

追加なし。既存のタイル取得だけ。

### 6. Authorization

既存のドライブ認可とアドオンポリシーを維持する。API追加なし。

### 7. Effect on existing features

地図の初期化と回転入力の受付だけを変更する。今回承認された配色・レイヤー、写真ピン・クラスタ・選択、カレンダー、一覧・スクロール復元は維持する。

### 8. Error behavior

回転入力は無視し、メッセージは表示しない。既存のエラー表示・ログは変更しない。

### 9. User-visible behavior

常に北が上に表示され、地図の方位は動かなくなる。移動・拡大縮小・写真選択は従来どおり。

### 10. Non-functional

同梱のMapLibreの標準APIのみを使う。依存・イベント監視・外部サービスを追加しない。

## Touch points

- frontend/map/createPhotoMap.ts: 初期bearing 0、dragRotate無効、touchZoomRotate.disableRotationとkeyboard.disableRotationを適用。ライブラリ用のMapLike型に必要なハンドラーだけを追加する。
- e2e/: 回転入力を送るブラウザテストと移動・ズームの回帰確認。
- README.md: 地図の操作説明に北上固定を明記する。
- コアdocs/user-guide/keyboard-shortcuts.md: Photo Diaryでの移動・ズームと北上固定を記載する。
- docs/specs/INDEX.md、docs/reviews/north-up-map/、検証後の一時本番反映の記録。
- 規則: コアの.claude/rules/design-decisions.md、frontend-conventions.md、process.md、docs/process/testing-and-comments.md。保護パス・設定・APIの変更なし。

## Invariants

I1. 右ドラッグ・Ctrlドラッグ・2本指回転・Shift左右矢印の後も地図のbearingは0である。

I2. 回転を無効にしても通常のドラッグ・矢印移動、ホイール・ピンチ・ズームボタン・キーボードズームは機能する。

I3. テーマ切替・ビューの非表示からの復帰・地図の再作成後も北上固定である。

I4. 写真ピンの押下結果・クラスタ・位置とズームの保存形式、外部通信先、認可と失敗時の操作は変更しない。

## Verification

仕様から別エージェントが受け入れテストを用意する。実ブラウザでマウス・キーボード・2点タッチの入力を送り、地図の方位が変わらず移動・ズームが使えることをREDからGREENで確認する。既存の地図関連テスト、型検査・lintを実行し、実装者以外のR-5とレビューを行う。検証後は現在のcodex/memory-mapブランチで本番へ一時反映し、HTTP応答と配信コードを確認する。

## Checked, no action

- 方向を戻すコンパスや回転許可の設定は追加しない。
- 回転後に0へ戻すイベント処理は使わず、入力ハンドラー側で回転を無効にする。
- 傾きの新しいUIや独自の操作ハンドラーは追加しない。キーボードの標準disableRotationが抑制する傾き操作はそのまま抑制される。
- 前回の地図デザインは変更しない。以前の承認済み仕様自体は編集しない。
