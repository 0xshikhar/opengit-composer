# OpenGit Composer Configuration

OpenGit Composer merges config from:
1. VS Code settings (`commitComposer.*`)
2. workspace `.gitcomposer.json`
3. defaults

Priority: `.gitcomposer.json` > VS Code settings > defaults.

## 1. Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `commitComposer.aiProvider` | `string` | `openai` | AI provider (`openai`, `anthropic`, `gemini`, `kimi`, `ollama`) |
| `commitComposer.apiKey` | `string` | `""` | Provider API key (cloud providers) |
| `commitComposer.model` | `string` | `""` | Model override (provider default when empty) |
| `commitComposer.ollamaHost` | `string` | `http://localhost:11434` | Ollama base URL |
| `commitComposer.commitFormat` | `string` | `conventional` | Commit style (`conventional`, `angular`, `gitmoji`, `custom`) |
| `commitComposer.maxSubjectLength` | `number` | `72` | Max commit subject length |
| `commitComposer.splitThreshold` | `number` | `3` | File-count threshold before splitting into multiple drafts |
| `commitComposer.debugMode` | `boolean` | `false` | Enables verbose debug output channel logs |
| `commitComposer.excludePatterns` | `string[]` | `[]` | Glob-like file patterns excluded from AI compose input |
| `commitComposer.redactPatterns` | `string[]` | `[]` | Regex patterns redacted in diff text before AI requests |

## 2. Example `.gitcomposer.json`

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "commitFormat": "conventional",
  "maxSubjectLength": 72,
  "splitThreshold": 4,
  "ollamaHost": "http://localhost:11434",
  "excludePatterns": [
    "**/*.pem",
    "**/.env*",
    "secrets/**"
  ],
  "redactPatterns": [
    "sk-[a-zA-Z0-9_-]{16,}",
    "(?i)password\\s*[:=]\\s*[^\\s]+",
    "(?i)authorization:\\s*bearer\\s+[a-zA-Z0-9._-]+"
  ]
}
```

## 3. Privacy Controls

### `excludePatterns`
- Applied at file level.
- Matching files are omitted from compose input.
- Glob-like matching supports `*`, `**`, and `?`.

### `redactPatterns`
- Applied to staged diff text.
- Regex matches are replaced with `[REDACTED]`.
- Invalid regex entries are ignored safely.

## 4. Key Storage

- Keys entered in UI are stored via VS Code SecretStorage.
- Keys are not written to `.gitcomposer.json`.
- Use command `Commit Composer: Copy Sanitized Logs` for support-safe logs.

## 5. Compose Safety

Compose response includes a staged snapshot fingerprint.

During commit:
- current staged set is recomputed,
- if fingerprint differs, commit is blocked,
- user is asked to refresh and re-compose.
