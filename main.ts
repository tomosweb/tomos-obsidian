import { App, Notice, Plugin, PluginSettingTab, RequestUrlResponse, Setting, TFile, normalizePath, requestUrl } from "obsidian";

interface TomosPublisherSettings {
  tomosUrl: string;
  token: string;
  articleFolder: string;
}

interface PreparedImage {
  name: string;
  data: ArrayBuffer;
  mimeType: string;
}

interface PreparedPost {
  content: string;
  images: PreparedImage[];
}

const DEFAULT_SETTINGS: TomosPublisherSettings = {
  tomosUrl: "",
  token: "",
  articleFolder: "",
};

const TOMOS_MARKDOWN_GUIDE_URL = "https://tomoswords.org/docs/markdown/";
const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_CHUNK_BYTES = 512 * 1024;
const IMAGE_EXTENSIONS: Record<string, { extension: string; mimeType: string }> = {
  jpg: { extension: "jpg", mimeType: "image/jpeg" },
  jpeg: { extension: "jpg", mimeType: "image/jpeg" },
  png: { extension: "png", mimeType: "image/png" },
  gif: { extension: "gif", mimeType: "image/gif" },
  webp: { extension: "webp", mimeType: "image/webp" },
};

const TOMOS_ARTICLE_TEMPLATE = `---
title: 記事のタイトル
# 公開先フォルダーを指定します。例: diary / blog
folder: diary
# 投稿日を指定する場合はYYYY-MM-DD形式。空欄なら初回公開日に自動補完されます
date:
draft: false
tags:
  - 日記
  - Tomos
---

# 記事のタイトル

ここに本文を書きます。

## 見出し

段落を書きます。

- 箇条書き
- 箇条書き

[リンクの文字](https://example.com/)

Obsidianに保存した画像は、通常の画像記法または ![[image.jpg]] で貼り付けてTomosへ送信できます。

[[別の記事]]
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default class TomosPublisherPlugin extends Plugin {
  settings: TomosPublisherSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "create-tomos-article",
      name: "Tomos記事を新規作成",
      callback: async () => {
        await this.createTomosArticle();
      }
    });

    this.addCommand({
      id: "open-tomos-markdown-guide",
      name: "Tomos用Markdownの書き方を開く",
      callback: () => {
        this.openMarkdownGuide();
      }
    });

    this.addCommand({
      id: "upload-current-markdown-to-tomos",
      name: "Tomosへ送信",
      callback: async () => {
        await this.sendCurrentFileToTomos();
      }
    });

    this.addRibbonIcon("send", "Tomosへ送信", async () => {
      await this.sendCurrentFileToTomos();
    });

    this.addSettingTab(new TomosPublisherSettingTab(this.app, this));
  }

  private async createTomosArticle(): Promise<void> {
    const path = this.findAvailableArticlePath(this.articleFolderPath());

    try {
      const file = await this.app.vault.create(path, TOMOS_ARTICLE_TEMPLATE);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice("Tomos記事を作成しました。");
    } catch {
      new Notice("Tomos: 記事を作成できませんでした。");
    }
  }

  private articleFolderPath(): string {
    let configured = this.settings.articleFolder.trim().replace(/^\/+|\/+$/g, "");
    if (configured === "") return "";

    configured = normalizePath(configured);
    const target = this.app.vault.getAbstractFileByPath(configured);
    return target && "children" in target ? configured : "";
  }

  private findAvailableArticlePath(folderPath: string): string {
    const baseName = "Tomos記事";
    let suffix = 0;

    while (true) {
      const fileName = suffix === 0 ? `${baseName}.md` : `${baseName} ${suffix}.md`;
      const candidate = normalizePath(folderPath ? `${folderPath}/${fileName}` : fileName);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      suffix += 1;
    }
  }

  openMarkdownGuide(): void {
    window.open(TOMOS_MARKDOWN_GUIDE_URL, "_blank");
  }

  private validateSettings(): string | null {
    const tomosUrl = this.settings.tomosUrl.trim();
    if (!/^https:\/\/[^\s]+$/i.test(tomosUrl)) return "Tomos URLはhttps://で始まるURLを設定してください。";
    if (this.settings.token.trim() === "") return "投稿用トークンが未設定です。";
    try {
      const url = new URL(tomosUrl);
      if (url.username || url.password || url.hash) return "Tomos URLが正しくありません。";
    } catch {
      return "Tomos URLが正しくありません。";
    }
    return null;
  }

  async testConnection(): Promise<void> {
    const invalid = this.validateSettings();
    if (invalid) {
      new Notice(`Tomos: ${invalid}`);
      return;
    }

    try {
      const response = await requestUrl({
        url: this.apiUrl(),
        method: "GET",
        headers: { "X-Tomos-Token": this.settings.token.trim() },
        throw: false,
      });
      if (response.status === 200) {
        new Notice("Tomos接続テストに成功しました。");
      } else if (response.status === 401) {
        new Notice("Tomos: 認証に失敗しました。");
      } else {
        new Notice("Tomos: 接続テストに失敗しました。");
      }
    } catch {
      new Notice("Tomos: Tomos URLを確認してください。");
    }
  }

  private async sendCurrentFileToTomos(): Promise<void> {
    const invalid = this.validateSettings();
    if (invalid) {
      new Notice(`Tomos: ${invalid}`);
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      new Notice("Tomos: Markdownファイルを開いてください。");
      return;
    }

    let uploadId = "";
    try {
      const content = await this.app.vault.read(file);
      const prepared = await this.preparePost(content, file);

      if (prepared.images.length === 0) {
        const response = await this.postJson({ filename: file.name, content: prepared.content });
        this.showSendResult(response.status, this.responseMessage(response));
        return;
      }

      const start = await this.postJson({
        action: "start",
        filename: file.name,
        content: prepared.content,
        images: prepared.images.map((image) => image.name),
      });
      if (start.status < 200 || start.status >= 300) {
        this.showSendResult(start.status, this.responseMessage(start));
        return;
      }
      const startJson: unknown = start.json;
      uploadId = isRecord(startJson) && typeof startJson.upload_id === "string" ? startJson.upload_id : "";
      if (uploadId === "") {
        throw new Error("画像の送信準備情報を受け取れませんでした。");
      }

      for (const image of prepared.images) {
        const sent = await this.sendImage(uploadId, image);
        if (!sent) return;
      }

      const finalize = await this.postJson({ action: "finalize", upload_id: uploadId });
      if (finalize.status < 200 || finalize.status >= 300) {
        await this.cancelImageUpload(uploadId);
        this.showSendResult(finalize.status, this.responseMessage(finalize));
        return;
      }
      uploadId = "";
      new Notice(`Tomosへ画像${prepared.images.length}点とMarkdownを送信しました。`);
    } catch (error: unknown) {
      if (uploadId !== "") await this.cancelImageUpload(uploadId);
      const message = error instanceof Error ? error.message : "Markdownを送信できませんでした。";
      new Notice(`Tomos: ${message}`);
    }
  }

  private async sendImage(uploadId: string, image: PreparedImage): Promise<boolean> {
    const chunkCount = Math.ceil(image.data.byteLength / IMAGE_CHUNK_BYTES);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const start = chunkIndex * IMAGE_CHUNK_BYTES;
      const end = Math.min(start + IMAGE_CHUNK_BYTES, image.data.byteLength);
      const response = await requestUrl({
        url: this.apiUrl(),
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Tomos-Token": this.settings.token.trim(),
          "X-Tomos-Action": "image",
          "X-Tomos-Upload-Id": uploadId,
          "X-Tomos-Image-Name": image.name,
          "X-Tomos-Image-Type": image.mimeType,
          "X-Tomos-Chunk-Index": String(chunkIndex),
          "X-Tomos-Chunk-Count": String(chunkCount),
          "X-Tomos-Total-Size": String(image.data.byteLength),
        },
        body: image.data.slice(start, end),
        throw: false,
      });
      if (response.status < 200 || response.status >= 300) {
        await this.cancelImageUpload(uploadId);
        this.showSendResult(response.status, this.responseMessage(response));
        return false;
      }
    }
    return true;
  }

  private async preparePost(content: string, sourceFile: TFile): Promise<PreparedPost> {
    const replacements: Array<{ start: number; end: number; text: string }> = [];
    const images = new Map<string, PreparedImage>();
    const occupied: Array<{ start: number; end: number }> = [];

    const wikiPattern = /!\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;
    let wikiMatch: RegExpExecArray | null;
    while ((wikiMatch = wikiPattern.exec(content)) !== null) {
      const target = wikiMatch[1].trim();
      const imageFile = this.resolveLocalImage(target, sourceFile);
      if (!imageFile) continue;
      const preparedImage = await this.prepareImage(imageFile);
      images.set(preparedImage.name, preparedImage);
      const alt = (wikiMatch[2] ?? imageFile.basename).trim() || imageFile.basename;
      replacements.push({
        start: wikiMatch.index,
        end: wikiMatch.index + wikiMatch[0].length,
        text: `![${this.escapeAlt(alt)}](images/${preparedImage.name})`,
      });
      occupied.push({ start: wikiMatch.index, end: wikiMatch.index + wikiMatch[0].length });
    }

    const markdownPattern = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownPattern.exec(content)) !== null) {
      const start = markdownMatch.index;
      const end = start + markdownMatch[0].length;
      if (occupied.some((range) => start >= range.start && end <= range.end)) continue;

      const rawTarget = markdownMatch[2].trim();
      if (/^(?:https?:|data:|#)/i.test(rawTarget)) continue;
      if (/^images\/tms-[a-f0-9]{16}\.(?:jpg|jpeg|png|gif|webp)$/i.test(rawTarget)) continue;

      const target = this.normalizedMarkdownTarget(rawTarget);
      if (target === "") continue;
      const imageFile = this.resolveLocalImage(target, sourceFile);
      if (!imageFile) {
        throw new Error(`画像「${target}」がVault内に見つかりません。`);
      }
      const preparedImage = await this.prepareImage(imageFile);
      images.set(preparedImage.name, preparedImage);
      replacements.push({
        start,
        end,
        text: `![${this.escapeAlt(markdownMatch[1])}](images/${preparedImage.name})`,
      });
    }

    if (images.size > MAX_IMAGE_COUNT) {
      throw new Error(`画像は${MAX_IMAGE_COUNT}点まで送信できます。`);
    }

    let rewritten = content;
    replacements.sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      rewritten = rewritten.slice(0, replacement.start) + replacement.text + rewritten.slice(replacement.end);
    }

    return { content: rewritten, images: Array.from(images.values()) };
  }

  private resolveLocalImage(target: string, sourceFile: TFile): TFile | null {
    let linkPath = target.trim();
    if (linkPath.startsWith("<") && linkPath.endsWith(">")) {
      linkPath = linkPath.slice(1, -1).trim();
    }
    try {
      linkPath = decodeURIComponent(linkPath);
    } catch {
      // Keep the original path when it is not valid percent encoding.
    }
    linkPath = linkPath.replace(/^\/+/, "");
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFile.path);
    if (!(file instanceof TFile)) return null;
    return IMAGE_EXTENSIONS[file.extension.toLowerCase()] ? file : null;
  }

  private normalizedMarkdownTarget(rawTarget: string): string {
    const angleMatch = rawTarget.match(/^<([^>]+)>/);
    if (angleMatch) return angleMatch[1].trim();
    const titleMatch = rawTarget.match(/^(\S+)(?:\s+["'][^"']*["'])?$/);
    return titleMatch ? titleMatch[1].trim() : rawTarget;
  }

  private async prepareImage(file: TFile): Promise<PreparedImage> {
    const format = IMAGE_EXTENSIONS[file.extension.toLowerCase()];
    if (!format) throw new Error(`画像「${file.name}」の形式には対応していません。`);
    const data = await this.app.vault.readBinary(file);
    if (data.byteLength <= 0) throw new Error(`画像「${file.name}」が空です。`);
    if (data.byteLength > MAX_IMAGE_BYTES) throw new Error(`画像「${file.name}」は10MB以下にしてください。`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return {
      name: `tms-${hash.slice(0, 16)}.${format.extension}`,
      data,
      mimeType: format.mimeType,
    };
  }

  private escapeAlt(alt: string): string {
    return alt.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\n/g, " ");
  }

  private async postJson(payload: Record<string, unknown>): Promise<RequestUrlResponse> {
    return requestUrl({
      url: this.apiUrl(),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tomos-Token": this.settings.token.trim(),
      },
      body: JSON.stringify(payload),
      throw: false,
    });
  }

  private async cancelImageUpload(uploadId: string): Promise<void> {
    if (uploadId === "") return;
    try {
      await this.postJson({ action: "cancel", upload_id: uploadId });
    } catch {
      // Pending uploads expire automatically on the Tomos side.
    }
  }

  private responseMessage(response: RequestUrlResponse): string {
    const json: unknown = response.json;
    if (isRecord(json) && typeof json.message === "string" && json.message.trim() !== "") {
      return json.message;
    }
    return "";
  }

  private showSendResult(status: number, serverMessage = ""): void {
    if (status >= 200 && status < 300) {
      new Notice("Tomosへ送信しました。");
    } else if (serverMessage !== "") {
      new Notice(`Tomos: ${serverMessage}`);
    } else if (status === 401) {
      new Notice("Tomos: 認証に失敗しました。");
    } else if (status === 409) {
      new Notice("Tomos: 同名ファイルが受信箱にあります。");
    } else if (status === 413) {
      new Notice("Tomos: Markdownまたは画像のサイズが大きすぎます。");
    } else {
      new Notice("Tomos: Markdownを送信できませんでした。");
    }
  }

  private apiUrl(): string {
    return `${this.settings.tomosUrl.trim().replace(/\/+$/, "")}/post/inbox/api/`;
  }

  async loadSettings(): Promise<void> {
    const saved: unknown = await this.loadData();
    this.settings = {
      tomosUrl: isRecord(saved) && typeof saved.tomosUrl === "string" ? saved.tomosUrl : DEFAULT_SETTINGS.tomosUrl,
      token: isRecord(saved) && typeof saved.token === "string" ? saved.token : DEFAULT_SETTINGS.token,
      articleFolder: isRecord(saved) && typeof saved.articleFolder === "string" ? saved.articleFolder : DEFAULT_SETTINGS.articleFolder,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class TomosPublisherSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TomosPublisherPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Tomos Publisher").setHeading();

    new Setting(containerEl)
      .setName("Tomos URL")
      .setDesc("例: https://tomoswords.org/dev/")
      .addText((text) =>
        text
          .setPlaceholder("https://tomoswords.org/dev/")
          .setValue(this.plugin.settings.tomosUrl)
          .onChange(async (value) => {
            this.plugin.settings.tomosUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("投稿用トークン")
      .setDesc("Tomos Postのセキュリティ画面で発行した専用トークンです。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.token).onChange(async (value) => {
          this.plugin.settings.token = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Tomos記事の作成フォルダ")
      .setDesc("Vault内の既存フォルダを指定します。空欄または存在しない場合はVaultルートへ保存します。フォルダは自動作成しません。")
      .addText((text) =>
        text
          .setPlaceholder("例: Tomos")
          .setValue(this.plugin.settings.articleFolder)
          .onChange(async (value) => {
            this.plugin.settings.articleFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tomos接続テスト")
      .addButton((button) =>
        button.setButtonText("接続テスト").onClick(async () => {
          await this.plugin.testConnection();
        })
      );

    new Setting(containerEl)
      .setName("Tomos用Markdown")
      .setDesc("Front MatterやTomosで使えるMarkdown記法を公式ガイドで確認できます。")
      .addButton((button) =>
        button.setButtonText("書き方を見る").onClick(() => {
          this.plugin.openMarkdownGuide();
        })
      );
  }
}
