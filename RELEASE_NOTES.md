# Tomos Publisher 0.3.0

Obsidian Desktop / MobileからGitHub版Tomosへ投稿できるようになりました。

- GitHub Appによる接続とRepository選択。GitHub PATは不要です。
- 記事の新規投稿・更新・名前変更・フォルダ移動・不要画像削除。
- 日付未記載時の初回公開日補完と、更新・移動時の初回公開日時保持。
- 本文・OGP画像の長辺最大2048pxへの自動縮小。Vaultの元画像は保持します。
- 従来Tomos Coreへの本文・画像・Bluesky投稿を引き続き利用できます。GitHub版ではBluesky投稿を行いません。

Desktop / Mobileの実機確認、契約テスト、ビルドを完了しました。

## インストール・更新

Assetsのmain.jsとmanifest.jsonをVaultの `.obsidian/plugins/tomos-publisher/` へ配置し、プラグインを再読み込みしてください。ZIPには同じ2ファイルを含みます。SHA256SUMSで配布ファイルのハッシュを確認できます。

今回はObsidian Community Pluginsへの登録・審査申請は行いません。

[使い方](https://tomoswords.org/docs/obsidian/) / [ソースと詳細手順](https://github.com/tomosweb/tomos-obsidian/blob/main/README.ja.md)
