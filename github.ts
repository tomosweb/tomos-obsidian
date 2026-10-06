import { App, Modal, Notice, Setting, requestUrl } from "obsidian";
const API = "https://tomoswords.org/publish-api/github/";
const CHUNK = 512 * 1024;
interface Repository { id: number; full_name: string; default_branch: string; }
export interface GithubConnection { grant: string; repository: { id: number; full_name: string; branch: string; content_root: string }; }
export interface GithubPublication { content_path: string; asset_paths: string[]; commit_sha: string; date: string; published: string; }
interface Image { name: string; data: ArrayBuffer; mimeType: string; }
interface Pending { state: string; verifier: string; expires: number; busy: boolean; epoch: number; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function base64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256(data: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function createPkce(): Promise<{ state: string; verifier: string; challenge: string }> {
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { state, verifier, challenge };
}
export function githubScope(connection: GithubConnection): string {
  const r = connection.repository; return `${r.id}:${r.full_name.toLowerCase()}:${r.branch}:${r.content_root}`;
}
export async function apiRequest(endpoint: string, grant = "", body?: Record<string, unknown>, bytes?: ArrayBuffer, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const response = await requestUrl({ url: API + endpoint, method: body || bytes ? "POST" : "GET",
    headers: { ...(grant ? { Authorization: `Bearer ${grant}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bytes ? { "Content-Type": "application/octet-stream" } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : bytes ? { body: bytes } : {}), throw: false });
  let payload: unknown; try { payload = response.json; } catch { payload = null; }
  const value = record(payload) ? payload : {};
  if (response.status < 200 || response.status >= 300 || value.ok === false) {
    const error = record(value.error) ? value.error : {};
    if (error.code === "branch_conflict") throw new Error("GitHub上のBranchが更新されています。もう一度送信してください。");
    if (response.status === 401) throw new Error("GitHub接続が失効しています。設定から再接続してください。");
    throw new Error(typeof error.message === "string" ? error.message : "GitHubへの要求を完了できませんでした。");
  }
  return value;
}
export function validateRelativePath(value: string, empty = false): void {
  if ((!value && !empty) || /[\\\0]/.test(value) || value.startsWith("/") || value.endsWith("/")
    || value.split("/").some((p) => p === "." || p === ".." || (!p && value !== ""))) throw new Error("公開先のパスを確認してください。");
}
export async function publishGithub(connection: GithubConnection, filename: string, folder: string, draft: boolean,
  prepared: { content: string; images: Image[] }, previous?: GithubPublication): Promise<GithubPublication> {
  validateRelativePath(folder, true); validateRelativePath(connection.repository.content_root);
  if (!filename.trim() || /[\/\\\0]/.test(filename)) throw new Error("記事のファイル名を確認してください。");
  if (prepared.images.length > 5) throw new Error("画像は5点まで送信できます。");
  const directory = `files/article-${(await sha256(new TextEncoder().encode(filename.trim()).buffer)).slice(0, 12)}`;
  let content = prepared.content; const images = [];
  for (const image of prepared.images) {
    if (image.data.byteLength <= 0 || image.data.byteLength > 10 * 1024 * 1024) throw new Error("画像は1点10MB以下にしてください。");
    const digest = await sha256(image.data);
    if (!image.name.startsWith(`tms-${digest.slice(0, 16)}.`)) throw new Error("画像の内容を確認できませんでした。");
    const from = `images/${image.name}`;
    content = content.split(`](${from})`).join(`](${directory}/${image.name})`).split(`image: ${from}`).join(`image: ${directory}/${image.name}`);
    images.push({ name: image.name, mime_type: image.mimeType, size: image.data.byteLength, sha256: digest });
  }
  const parts = connection.repository.full_name.split("/");
  if (parts.length !== 2) throw new Error("GitHub接続を確認してください。");
  const payload: Record<string, unknown> = { request_id: `publisher-${base64url(crypto.getRandomValues(new Uint8Array(24)))}`,
    repository: { id: connection.repository.id, owner: parts[0], name: parts[1], branch: connection.repository.branch, content_root: connection.repository.content_root },
    document: { filename, folder, content, state: draft ? "draft" : "published", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    ...(previous ? { previous: { content_path: previous.content_path, asset_paths: previous.asset_paths } } : {}) };
  let uploadId = "";
  try {
    let result = await apiRequest("publish.php", connection.grant, images.length ? { ...payload, action: "start", images } : payload);
    if (images.length) {
      if (typeof result.upload_id !== "string" || !result.upload_id) throw new Error("画像の送信準備情報を受け取れませんでした。");
      uploadId = result.upload_id;
      for (const image of prepared.images) {
        const count = Math.ceil(image.data.byteLength / CHUNK);
        for (let index = 0; index < count; index++) await apiRequest("publish-image.php", connection.grant, undefined,
          image.data.slice(index * CHUNK, (index + 1) * CHUNK), { "X-Tomos-Upload-Id": uploadId, "X-Tomos-Image-Name": image.name,
            "X-Tomos-Chunk-Index": String(index), "X-Tomos-Chunk-Count": String(count), "X-Tomos-Total-Size": String(image.data.byteLength) });
      }
      result = await apiRequest("publish.php", connection.grant, { action: "finalize", upload_id: uploadId }); uploadId = "";
    }
    if (result.ok !== true || typeof result.content_path !== "string" || typeof result.commit_sha !== "string"
      || !Array.isArray(result.asset_paths) || !result.asset_paths.every((p) => typeof p === "string")) throw new Error("投稿結果を確認できませんでした。再送信前にGitHub上の記事を確認してください。");
    return { content_path: result.content_path, asset_paths: result.asset_paths as string[], commit_sha: result.commit_sha,
      date: typeof result.date === "string" ? result.date : "", published: typeof result.published === "string" ? result.published : "" };
  } finally { if (uploadId) { try { await apiRequest("publish.php", connection.grant, { action: "cancel", upload_id: uploadId }); } catch { /* Server TTL cleanup. */ } } }
}
class ConnectionModal extends Modal {
  constructor(app: App, private render: (container: HTMLElement) => void) { super(app); }
  onOpen(): void { this.render(this.contentEl); }
  onClose(): void { this.contentEl.empty(); }
}
export class GithubConnector {
  private pending: Pending | null = null;
  private epoch = 0;
  private modal: ConnectionModal | null = null;
  constructor(private app: App, private save: (connection: GithubConnection) => Promise<void>) {}
  cancel(): void { this.epoch++; this.pending = null; this.modal?.close(); this.modal = null; }
  async start(): Promise<void> {
    this.cancel(); const epoch = this.epoch;
    try {
      const pkce = await createPkce(); if (epoch !== this.epoch) return;
      this.pending = { ...pkce, expires: Date.now() + 10 * 60 * 1000, busy: false, epoch };
      const url = API + "connect/start.php?" + new URLSearchParams({ client: "publisher", state: pkce.state, code_challenge: pkce.challenge });
      this.modal = new ConnectionModal(this.app, (container) => {
        container.createEl("h2", { text: "GitHubに接続" });
        container.createEl("p", { text: "ブラウザで接続を確認し、「Obsidianに戻る」を押してください。" });
        new Setting(container).setName("接続画面").addButton((b) => b.setButtonText("ブラウザで開く").onClick(() => { window.open(url, "_blank"); }));
        let code = "";
        new Setting(container).setName("接続コード").setDesc("戻れない場合は、ブラウザの5分間有効のコードを貼り付けます。")
          .addTextArea((t) => { t.inputEl.rows = 3; t.onChange((v) => { code = v.trim(); }); });
        new Setting(container).addButton((b) => b.setButtonText("コードで接続").onClick(async () => { await this.receive(code, pkce.state); }));
      }); this.modal.open(); window.open(url, "_blank");
    } catch { new Notice("Tomos: GitHub接続を開始できませんでした。"); }
  }
  async receive(code: string | undefined, state: string | undefined): Promise<void> {
    const pending = this.pending;
    if (!pending || pending.busy || !code || state !== pending.state || pending.epoch !== this.epoch || Date.now() >= pending.expires) {
      new Notice("Tomos: 設定からGitHub接続を開始し直してください。"); return;
    }
    pending.busy = true;
    try {
      const result = await apiRequest("connect/exchange.php", "", { client: "publisher", code, state, code_verifier: pending.verifier });
      if (pending.epoch !== this.epoch) return; this.pending = null;
      if (typeof result.discovery_grant !== "string") throw new Error("接続情報を受け取れませんでした。");
      const discovery = result.discovery_grant;
      const response = await apiRequest("repositories.php", discovery); if (pending.epoch !== this.epoch) return;
      const repositories = Array.isArray(response.repositories) ? response.repositories.filter((r): r is Repository =>
        record(r) && typeof r.id === "number" && typeof r.full_name === "string" && typeof r.default_branch === "string") : [];
      if (!repositories.length) throw new Error("投稿できるRepositoryがありません。GitHub Appへの許可を確認してください。");
      this.modal?.close(); this.selectRepository(repositories, discovery, pending.epoch);
    } catch (error: unknown) { if (pending.epoch === this.epoch) new Notice(`Tomos: ${error instanceof Error ? error.message : "接続できませんでした。"}`); }
    finally { pending.busy = false; }
  }
  private selectRepository(repositories: Repository[], discovery: string, epoch: number): void {
    this.modal = new ConnectionModal(this.app, (container) => {
      container.createEl("h2", { text: "投稿先Repositoryを選択" });
      let selected = repositories[0]; let branch = selected.default_branch; let root = "content"; let busy = false;
      let branchInput: HTMLInputElement;
      new Setting(container).setName("Repository").addDropdown((d) => {
        for (const r of repositories) d.addOption(String(r.id), r.full_name);
        d.setValue(String(selected.id)).onChange((v) => { selected = repositories.find((r) => String(r.id) === v)!; branch = selected.default_branch; branchInput.value = branch; });
      });
      new Setting(container).setName("Branch").addText((t) => { branchInput = t.inputEl; t.setValue(branch).onChange((v) => { branch = v.trim(); }); });
      new Setting(container).setName("Content root").setDesc("記事を保存するフォルダー。通常はcontentです。")
        .addText((t) => t.setValue(root).onChange((v) => { root = v.trim(); }));
      new Setting(container).addButton((button) => button.setButtonText("このRepositoryに接続").setCta().onClick(async () => {
        if (busy || epoch !== this.epoch) return; busy = true; button.setDisabled(true);
        try {
          validateRelativePath(root);
          const result = await apiRequest("connect/bind.php", discovery, { repository_id: selected.id, branch, content_root: root });
          if (epoch !== this.epoch) return; const r = result.repository;
          if (typeof result.publish_grant !== "string" || !record(r) || typeof r.id !== "number" || typeof r.full_name !== "string"
            || typeof r.branch !== "string" || typeof r.content_root !== "string") throw new Error("投稿先情報を受け取れませんでした。");
          await this.save({ grant: result.publish_grant, repository: { id: r.id, full_name: r.full_name, branch: r.branch, content_root: r.content_root } });
          this.cancel(); new Notice(`GitHub接続が完了しました: ${r.full_name}`);
        } catch (error: unknown) { if (epoch === this.epoch) new Notice(`Tomos: ${error instanceof Error ? error.message : "Repositoryへ接続できませんでした。"}`); }
        finally { busy = false; button.setDisabled(false); }
      }));
    }); this.modal.open();
  }
  async test(connection: GithubConnection | null): Promise<void> {
    if (!connection) { new Notice("Tomos: GitHubに接続してください。"); return; }
    try {
      const result = await apiRequest("status.php", connection.grant); if (result.connected !== true) throw new Error("GitHubに再接続してください。");
      new Notice(`GitHub接続テストに成功しました: ${connection.repository.full_name}`);
    } catch (error: unknown) { new Notice(`Tomos: ${error instanceof Error ? error.message : "接続を確認できませんでした。"}`); }
  }
}
