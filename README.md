# まなびノート

勉強ノートと問題集のアプリ（PWA）。PC でもスマホでも使え、ホーム画面に追加するとアプリのように開けます。

## できること

- **ノートをいくつでも作成**（フォルダ分け・検索つき）
- **ノートの形式**
  - 📓 罫線ノート / 📐 方眼ノート / 📄 無地
  - 📝 箇条書き（Enter で次の項目、Tab で字下げ、チェックボックス）
  - 🗂️ コーネル式（キーワード／ノート／まとめ）
  - 🃏 暗記カード（表と裏、赤シート表示、フラッシュカード）
  - 形式はあとから変更できます
- **暗記モード**：`[[語句]]` で囲んだ部分が赤シートのように隠れ、タップで表示
- **問題集**：選択・複数選択・記述・数値・**仕訳（簿記）**・自己採点の 6 形式。
  間違えた問題だけ／未回答だけ／シャッフル／分野別で出題、正答率の記録
- **AI で問題集を作成・追加**（コピペ方式／Claude Code が直接書き込む方式）
- **GitHub 同期**：PC とスマホで同じ内容（オフラインでも使え、つながったら同期）

## 公開のしかた（GitHub Pages）

1. GitHub で新しいリポジトリ（例: `study-notes`）を **Public** で作り、このフォルダの中身を push
2. リポジトリの **Settings → Pages** → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして Save
3. 1〜2 分後に `https://<ユーザー名>.github.io/study-notes/` で開けます
4. スマホでその URL を開き、
   - iPhone（Safari）: 共有ボタン → **ホーム画面に追加**
   - Android（Chrome）: メニュー → **アプリをインストール** / ホーム画面に追加

## PC とスマホで同期する

ノートのデータはアプリ本体とは別の **非公開リポジトリ** に保存します。

1. GitHub で新しいリポジトリ（例: `study-notes-data`）を **Private** で作成（空のままで OK）
2. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → `study-notes-data` だけ選ぶ
   - Permissions → Repository permissions → **Contents: Read and write**
3. アプリの ⚙️ 設定 → GitHub 同期 に ユーザー名・リポジトリ名・トークンを入れて「保存して同期」
4. スマホでも同じ設定を入れる

同期は編集の数秒後・アプリを開いたとき・閉じたときに自動で行われます（右上の表示をタップで手動同期）。
同じノートを 2 台で同時に編集した場合は、片方が「（競合コピー）」として残るので内容は消えません。

## AI に問題集を作ってもらう

### 方法 1: コピペ（Claude・ChatGPT など何でも）
問題集タブの「＋ 新規」または問題集の「🤖 AIで追加」→ 作りたい内容を書いて **依頼文をコピー** → AI に貼る → 返ってきた JSON をアプリに貼って取り込み。
依頼文には出力形式と既存の問題一覧が入るので、重複しない問題を追加できます。

### 方法 2: Claude Code に直接頼む
データ用リポジトリ（`study-notes-data`）を Claude Code で開いて、
「簿記3級の仕訳問題を20問作って」「○○の問題集に減価償却の問題を10問追加して」のように頼むだけ。
初回同期時にアプリがデータリポジトリへ `CLAUDE.md`（データ形式の説明）を自動で置くので、
Claude がそれを読んで `data/quizzes/*.json` を作成・編集し、`main` に push → アプリに反映されます。

## ファイル構成

```
index.html             画面
style.css              デザイン
app.js                 アプリ本体
sw.js                  オフライン対応（Service Worker）
manifest.webmanifest   ホーム画面に追加したときの設定
icons/                 アイコン
```

データリポジトリ側:

```
CLAUDE.md                  データ形式の説明（AI 向け、アプリが自動作成）
data/notes/<id>.json       ノート
data/quizzes/<id>.json     問題集
data/progress/<id>.json    解答記録
```
