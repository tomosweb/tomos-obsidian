# Tomos Publisher

Tomos Publisherは、Obsidian Desktop / Mobileで開いているMarkdownをTomosへHTTPS送信するプラグインです。

## 必要環境

- Tomos v0.1.0-alpha.15以降
- HTTPSで利用できるTomosサイト
- Obsidian Desktop または Mobile

## インストール

Tomos Publisherは現在alpha版のため、Obsidian Community Pluginsには登録していません。

GitHub Releaseから以下の2ファイルをダウンロードしてください。

- `main.js`
- `manifest.json`

[Tomos Publisher 0.1.0 alphaをダウンロード](https://github.com/tomosweb/tomos-obsidian/releases/tag/0.1.0)

Desktop / Mobileとも同じプラグインファイルを使用します。

### 1. プラグインフォルダーを作成

使用するObsidian Vault内に、次のフォルダーを作成します。

```text
<Vault>/.obsidian/plugins/tomos-obsidian/
```

`.obsidian` フォルダーが見えない場合は、OSやファイル管理アプリで隠しファイルを表示してください。

### 2. ファイルを配置

ダウンロードした2ファイルを、作成したフォルダーへ配置します。

```text
<Vault>/.obsidian/plugins/tomos-obsidian/
  main.js
  manifest.json
```

### 3. Obsidianで有効化

Obsidianを開き、「設定」→「コミュニティプラグイン」から`Tomos Publisher`を有効にしてください。

プラグインが一覧に表示されない場合は、Obsidianを再起動してください。

### 4. Tomosを設定

Tomos Publisherの設定画面で、Tomos URLと投稿用トークンを入力します。設定後、「Tomos接続テスト」を実行してください。

投稿用トークンは、Tomos Postの「セキュリティ」から発行できます。

## できること

- 現在開いているMarkdownをTomosへ送信
- Desktop / Mobile共通対応
- Tomos専用投稿トークンによる認証
- `draft: true` の原稿をTomos Inboxへ保持
- `draft: false` またはdraft未指定の原稿をTomos側の公開処理へ送信
- Tomos Inboxから確認後に手動公開

## 現在対応していないこと

- 画像転送
- Obsidianの `![[image.jpg]]` 記法による画像転送
- 複数Tomosサイト切替
- Front Matterの自動編集

画像を含む記事は現在Tomos Writeをご利用ください。

## Tomos側の準備

Tomos Postへログインし、「セキュリティ」から投稿用トークンを発行します。

投稿用トークンの平文は発行時のみ表示されます。Tomos Postの管理用合言葉とは別のトークンです。

## プラグイン設定

ObsidianのTomos Publisher設定で、Tomos URLと投稿用トークンを入力します。

設定後、「Tomos接続テスト」を実行してください。

## 投稿方法

1. ObsidianでMarkdownを開く
2. リボンまたはコマンドパレットから「Tomosへ送信」を実行
3. TomosへHTTPS送信
4. Tomos側でdraft指定に応じて処理

### draft: true

Tomos Inboxへ保持されます。Tomos Postから内容を確認し、「公開する」を選択すると公開できます。

### draft: false / draft未指定

Tomos側の自動公開対象になります。

## Tomos用Markdown

Tomos PublisherはMarkdownやFront Matterを書き換えず、そのままTomosへ送信します。

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
- `folder`: 公開先フォルダー
- `date`: 投稿日。空欄または未指定の場合はTomosが初回公開日を補完
- `draft: false`: 公開対象
- `draft: true`: Tomos Inboxへ保持
- `tags`: タグ

詳しい書き方は[Tomos用Markdownの書き方](https://tomoswords.org/docs/markdown/)をご覧ください。

## 記事テンプレート

[記事テンプレート](templates/article-template.md)をObsidian Vaultへコピーして利用できます。

## セキュリティ

Tomos PublisherはTomos Postの管理用合言葉を使用せず、外部投稿専用トークンを利用します。Tomos側では投稿トークンのハッシュのみを保存します。

## ライセンス

MIT License。詳細は[LICENSE](LICENSE)を参照してください。
