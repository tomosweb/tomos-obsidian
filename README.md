# Tomos Publisher

Tomos Publisherは、Obsidian Desktop / MobileからMarkdownと画像をTomosへHTTPS送信するプラグインです。

Tomosで記事を書き始めるための新規作成コマンド、Tomos Inboxへの下書き送信、画像付き投稿に対応しています。

## 必要環境

- Tomos v0.1.0-beta.1以降
- HTTPSで利用できるTomosサイト
- Obsidian Desktop または Mobile

## インストール

Tomos Publisherは現在Obsidian Community Pluginsへの登録準備中です。登録までは手動でインストールできます。

このリポジトリの次の2ファイルを使用します。

- `main.js`
- `manifest.json`

使用するObsidian Vault内に次のフォルダーを作成し、2ファイルを配置してください。

```text
<Vault>/.obsidian/plugins/tomos-obsidian/
  main.js
  manifest.json
```

`.obsidian` が見えない場合は、OSやファイル管理アプリで隠しファイルを表示してください。

配置後、Obsidianを開き、「設定」→「コミュニティプラグイン」から `Tomos Publisher` を有効にします。一覧に表示されない場合はObsidianを再起動してください。

Desktop / Mobileとも同じプラグインファイルを使用します。

## できること

- 現在開いているMarkdownをTomosへ送信
- Vault内のローカル画像をMarkdownと一緒に送信
- 通常のMarkdown画像記法 `![alt](path)` に対応
- Obsidian画像埋め込み `![[image.jpg]]` に対応
- Tomos用Front Matter入りの記事をコマンドから新規作成
- 新規記事の保存先としてVault内の既存フォルダを指定
- `draft: true` の原稿をTomos Inboxへ送信
- Tomos Inboxで画像を含めてプレビュー
- Inboxから確認後に手動公開
- `draft: false` またはdraft未指定の原稿をTomos側の公開処理へ送信
- 公式の「Tomos用Markdownの書き方」をObsidianから開く
- Desktop / Mobile共通対応

## 現在対応していないこと

- 複数Tomosサイトの切り替え
- 既存MarkdownのFront Matter自動編集
- SVG画像の転送

画像はJPEG、PNG、GIF、WebPに対応し、1記事5点まで、1点10MBまでです。

## Tomos側の準備

Tomos Postへログインし、「セキュリティ」から投稿用トークンを発行します。

投稿用トークンの平文は発行時のみ表示されます。Tomos Postの管理用合言葉とは別のトークンです。

## プラグイン設定

ObsidianのTomos Publisher設定で、Tomos URLと投稿用トークンを入力します。

「Tomos記事の作成フォルダ」には、Vault内の既存フォルダを指定できます。

- 指定したフォルダが存在する場合: そのフォルダに記事を作成
- 空欄の場合: Vaultルートに作成
- 指定フォルダが存在しない場合: Vaultルートに作成

Tomos PublisherはVault内にフォルダを自動作成しません。現在開いているノートの場所にも依存しません。

設定後、「Tomos接続テスト」を実行してください。

同じ設定画面から、公式のTomos用Markdownガイドも開けます。

## Tomos記事を新しく書く

1. 必要なら設定画面の「Tomos記事の作成フォルダ」に既存フォルダを指定
2. コマンドパレットから「Tomos記事を新規作成」を実行
3. Tomos用Front Matter入りのMarkdownが作成される
4. Obsidianで記事を書く
5. 必要ならVault内の画像を通常どおり貼り付ける
6. 「Tomosへ送信」を実行

同名ファイルがある場合は、`Tomos記事 1.md`、`Tomos記事 2.md` のように重複しない名前で作成します。

## 既存のMarkdownを送信する

1. ObsidianでMarkdownを開く
2. リボンまたはコマンドパレットから「Tomosへ送信」を実行
3. ローカル画像がある場合は、送信用Markdownだけ画像参照をTomos標準形式へ変換
4. Markdownと画像をTomosへHTTPS送信
5. `draft` の指定に応じてInbox保存または公開処理へ進む

Obsidian Vault内の元Markdownは書き換えません。画像もVaultから削除・移動しません。

## 画像

以下のどちらの記法でもVault内の画像を検出します。

```markdown
![写真](attachments/photo.jpg)
![[photo.jpg]]
```

送信時に画像内容のSHA-256からTomos標準の `tms-...` 管理名を生成し、Tomosへ送るMarkdown内の参照だけを次のように変換します。

```markdown
![写真](images/tms-0123456789abcdef.jpg)
```

画像データは512KB単位に分けてHTTPS送信します。Tomos側では総サイズ、内容ハッシュ、実画像形式を確認してからInbox用の一時画像として受け入れます。

Inboxにある間、画像は公開コンテンツとは別の非公開一時領域に保持されます。Tomos Postの認証済みInboxプレビューでは画像も表示されます。

公開時に画像はTomos既存の画像処理へ渡され、以後は通常のTomos管理画像になります。記事の修正・取り下げに伴う画像削除も、Tomos既存の参照確認・削除ルールに従います。

外部URL画像は転送せず、そのURLをMarkdownに残します。

## 下書きと公開

### `draft: true`

Tomos Inboxへ保持されます。Tomos Postで本文と画像をプレビューし、「公開する」を選択すると公開できます。

### `draft: false` / draft未指定

Tomos側の公開処理へ送信されます。

## Tomos用Markdown

Tomos Publisherは既存のMarkdownやFront MatterをVault上では書き換えません。画像転送が必要な場合だけ、Tomosへ送信するMarkdownの画像参照を標準管理名へ変換します。

```yaml
---
title: 記事のタイトル
folder: diary
date:
draft: false
tags:
  - 日記
---
```

- `title`: 記事タイトル
- `folder`: Tomos側の公開先フォルダー
- `date`: 投稿日。空欄または未指定の場合はTomosが初回公開日を補完
- `draft: false`: 公開対象
- `draft: true`: Tomos Inboxへ保持
- `tags`: タグ

Vault内で記事を保存するフォルダと、Front Matterの `folder:` で指定するTomos側の公開先は別の設定です。

詳しい書き方は[Tomos用Markdownの書き方](https://tomoswords.org/docs/markdown/)をご覧ください。コマンドパレットの「Tomos用Markdownの書き方を開く」からも開けます。

## 記事テンプレート

コマンドパレットの「Tomos記事を新規作成」で、Tomos用Front Matterと基本的なMarkdown例が入った新規ノートを作成できます。

リポジトリ内の[記事テンプレート](templates/article-template.md)をObsidian Vaultへコピーして利用することもできます。

TomosのMarkdown仕様の正本は公式の[Tomos用Markdownの書き方](https://tomoswords.org/docs/markdown/)です。プラグイン内のテンプレートは、記事を書き始めるための初期雛形として扱います。

## セキュリティ

Tomos PublisherはTomos Postの管理用合言葉を使用せず、外部投稿専用トークンを利用します。Tomos側では投稿トークンのハッシュのみを保存します。

画像はMarkdownで参照される管理名と内容ハッシュが一致する場合だけ受け入れます。Inbox用の画像一時領域は公開コンテンツの保存先とは分離されています。

## 動作確認

Desktop / Mobileの両方で、以下の一連の操作を確認しています。

- Tomos記事の新規作成
- 保存先フォルダ指定
- 画像付きMarkdown送信
- `draft: true` でInbox保存
- Inboxで画像付きプレビュー
- 手動公開
- 公開後画像表示
- `date:` 空欄時の初回公開日自動補完

## ライセンス

MIT License。詳細は[LICENSE](LICENSE)を参照してください。
