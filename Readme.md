# OpenGit Composer

OpenGit Composer is a VS Code extension that turns staged git changes into semantic, reviewable commit drafts with AI.

It groups related changes, explains the reasoning, and lets you inspect, edit, and commit from a dedicated composer panel or the Activity Bar container.


## Installation

### Marketplace

Install it from the VS Code Extensions view when published to the marketplace.

### VSIX

Download the VSIX directly:

[Download `opengit-composer-2.0.0.vsix`](https://github.com/0xshikhar/git-composer/raw/main/opengit-composer-2.0.0.vsix)

Then install it with:

```bash
code --install-extension opengit-composer-2.0.0.vsix
```


## Features

- AI-assisted commit planning from staged changes
- Support for multiple providers:
  - OpenAI
  - Anthropic
  - Groq
  - Google Gemini
  - Kimi (Moonshot)
  - Ollama for local/offline use
- Semantic grouping of changes into atomic commits
- Conventional, Angular, Gitmoji, and custom commit styles
- Interactive diff viewer and draft editor
- Batch commit execution with progress feedback
- Provider connection testing and model availability checks
- Privacy controls for excluded files and redacted patterns

## How It Works

1. Stage the changes you want to commit.
2. Open **OpenGit Composer** from the VS Code Activity Bar.
3. Choose a provider and model in **AI Controls**.
4. Add an API key if your provider needs one.
5. Click **Compose** to generate commit drafts.
6. Review the grouped files, edit messages if needed, then commit individually or in batch.

## Configuration

You can configure OpenGit Composer in VS Code settings or by using the extension UI.

| Setting | Description | Default |
| --- | --- | --- |
| `commitComposer.aiProvider` | AI provider to use | `openai` |
| `commitComposer.apiKey` | API key for the selected provider | `""` |
| `commitComposer.model` | Model to use, or leave empty for provider default | provider default |
| `commitComposer.ollamaHost` | Ollama server URL | `http://localhost:11434` |
| `commitComposer.commitFormat` | Commit style (`conventional`, `angular`, `gitmoji`, `custom`) | `conventional` |
| `commitComposer.maxSubjectLength` | Maximum commit subject length | `72` |
| `commitComposer.splitThreshold` | File count threshold for splitting commits | `3` |
| `commitComposer.excludePatterns` | Glob patterns excluded from AI input | `[]` |
| `commitComposer.redactPatterns` | Regex patterns redacted before sending diffs to AI | `[]` |
| `commitComposer.debugMode` | Enable detailed logging | `false` |

## Privacy

OpenGit Composer sends staged diffs only to the provider you choose.

- API keys stay local in VS Code settings.
- You can exclude files from compose input.
- You can redact sensitive text before any request is sent.
- Ollama can keep all analysis local on your machine.

## Commands

- `Commit Composer: Auto Compose`
- `Commit Composer: Show Debug Logs`
- `Commit Composer: Copy Sanitized Logs`

## Support

- Repository: https://github.com/0xshikhar/git-composer
- Issues: https://github.com/0xshikhar/git-composer/issues
