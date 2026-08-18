# Tomos Publisher

Tomos Publisher sends Markdown and local images from Desktop and Mobile to a Tomos site over HTTPS.

It can create Tomos-ready article templates, send drafts to Tomos Inbox for preview, and publish image-aware posts without modifying the original Markdown file or local images in the Vault.

[日本語版 README](README.ja.md)

## Requirements

- Tomos v0.1.0-beta.1 or later
- A Tomos site available over HTTPS
- Obsidian Desktop or Mobile

## Features

- Send the currently open Markdown file to Tomos
- Transfer local Vault images together with Markdown
- Support standard Markdown image syntax such as `![alt](path)`
- Support Obsidian image embeds such as `![[image.jpg]]`
- Create a new article with Tomos front matter from the command palette
- Save newly created articles in an existing Vault folder selected in settings
- Send `draft: true` articles to Tomos Inbox for preview
- Preview Markdown and staged images in Tomos Inbox before publication
- Send `draft: false` articles to the Tomos publication flow
- Open the official Tomos Markdown guide from the command palette
- Use the same plugin on Desktop and Mobile

Local images are converted only in the outgoing Markdown. Tomos Publisher does not rewrite the original Markdown file and does not move or delete images in the Vault.

Supported image formats are JPEG, PNG, GIF, and WebP. A single article can send up to 5 images, with a maximum size of 10 MB per image.

## Setup

Sign in to Tomos Post and issue a dedicated publishing token from the Security screen. This token is separate from the Tomos Post administration password.

In the Tomos Publisher settings, enter:

- **Tomos URL**: the HTTPS URL of the target Tomos site
- **Publishing token**: the dedicated token issued by Tomos Post
- **Article folder**: an optional existing Vault folder for newly created Tomos articles

Tomos Publisher never creates Vault folders automatically. If the configured article folder is empty or does not exist, new articles are created in the Vault root.

## Sending Markdown and images

Open a Markdown file and run **Send to Tomos** from the command palette or ribbon.

Local image references are detected and transferred with the Markdown. The outgoing Markdown is rewritten to use Tomos-managed image names derived from the image SHA-256 hash. External image URLs are not transferred and remain unchanged.

Image data is uploaded in 512 KB chunks. Before publication, staged images remain in the private Tomos Inbox image area. When the article is published, the images enter the normal Tomos managed-image lifecycle.

## Drafts and publication

With `draft: true`, the article remains in Tomos Inbox for review and manual publication.

With `draft: false`, or when `draft` is omitted, the article is sent to the Tomos publication flow.

Example front matter:

```yaml
---
title: Article title
folder: diary
date:
draft: false
tags:
  - diary
---
```

The Vault folder used to store the source Markdown and the Tomos `folder:` front matter value are independent settings.

## Manual installation

Until installation through the Community Plugins directory is available, download `main.js` and `manifest.json` from the latest GitHub Release and place them in:

```text
<Vault>/.obsidian/plugins/tomos-publisher/
  main.js
  manifest.json
```

Then enable **Tomos Publisher** in Settings → Community plugins.

## Development

```bash
npm ci
npm run build
```

`main.js` is a generated bundle and is distributed through GitHub Release assets rather than committed to the repository.

## Security

Tomos Publisher uses a dedicated external publishing token and sends data only to the user-configured Tomos HTTPS endpoint. Tomos stores only the token hash on the server side.

Images are accepted only when their managed name and content hash are consistent. Inbox staging is separated from the public content area.

## License

MIT License. See [LICENSE](LICENSE).
