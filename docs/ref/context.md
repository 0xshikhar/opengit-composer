# OpenGit Composer - Project Context

## Overview

**OpenGit Composer** is a VS Code extension (v2.0.5) that uses AI to generate semantic git commits from staged changes. It groups related changes into atomic commits with proper conventional commit formatting.

- **Repository**: https://github.com/0xshikhar/opengit-composer
- **VS Code Min Version**: 1.85.0
- **Runtime**: Node.js + VS Code Extension API + React webview

## Supported AI Providers

| Provider | API Key Required | Local |
| --- | --- | --- |
| OpenAI | Yes | No |
| Anthropic | Yes | No |
| Groq | Yes | No |
| Google Gemini | Yes | No |
| Kimi (Moonshot) | Yes | No |
| Ollama | No | Yes |
| LM Studio | No | Yes |

## Project Structure

```
git-composer/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── core/                    # Core business logic
│   │   ├── orchestrator.ts      # Compose pipeline orchestration
│   │   ├── commitExecutor.ts   # Commit execution (single/batch)
│   │   ├── git/gitService.ts    # Git operations
│   │   ├── privacyPolicy.ts    # Privacy filtering
│   │   ├── configLoader.ts      # Settings loading
│   │   └── keyManager.ts       # SecretStorage key management
│   ├── ai/                      # AI layer
│   │   ├── aiProvider.ts       # Provider interface
│   │   ├── aiProviderFactory.ts
│   │   ├── promptBuilder.ts    # Prompt construction
│   │   ├── responseParser.ts    # AI response parsing
│   │   └── providers/          # Provider implementations
│   │       ├── openai.ts
│   │       ├── anthropic.ts
│   │       ├── groq.ts
│   │       ├── google.ts / gemini.ts
│   │       ├── ollama.ts
│   │       ├── lmstudio.ts
│   │       └── kimi.ts
│   ├── webview/                 # Webview UI
│   │   ├── CommitComposerProvider.ts
│   │   ├── CommitComposerPanel.ts
│   │   └── ui/                 # React components
│   │       ├── App.tsx
│   │       ├── store/commitStore.ts  # Zustand state
│   │       └── components/
│   ├── features/               # Feature modules
│   │   ├── compose/
│   │   ├── provider-health/
│   │   └── privacy/
│   ├── test/                   # Test suite
│   └── types/                  # TypeScript types
├── docs/                       # Documentation
├── dist/                       # Build output
├── out/                        # Test output
└── media/                      # Icons/assets
```

## Key Dependencies

- **React**: 19.x (webview UI)
- **Zustand**: 5.x (state management)
- **simple-git**: 3.x (git operations)
- **axios**: 1.x (HTTP client)
- **Monaco Editor**: 4.x (diff viewer)

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Compile for development
pnpm run compile

# Watch mode (auto-recompile)
pnpm run watch

# Run tests
pnpm run test

# Run integration tests
pnpm run test:integration

# Lint
pnpm run lint

# Package as VSIX
pnpm run package:vsix
```

## Configuration (VS Code Settings)

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `commitComposer.aiProvider` | string | `"openai"` | AI provider |
| `commitComposer.apiKey` | string | `""` | API key (stored in SecretStorage) |
| `commitComposer.model` | string | `""` | Model override |
| `commitComposer.ollamaHost` | string | `"http://localhost:11434"` | Ollama URL |
| `commitComposer.lmStudioHost` | string | `"http://localhost:1234/v1"` | LM Studio URL |
| `commitComposer.commitFormat` | string | `"conventional"` | Format style |
| `commitComposer.maxSubjectLength` | number | `72` | Subject line max length |
| `commitComposer.splitThreshold` | number | `3` | Files before splitting |
| `commitComposer.debugMode` | boolean | `false` | Debug logging |
| `commitComposer.excludePatterns` | array | `[]` | Files to exclude |
| `commitComposer.redactPatterns` | array | `[]` | Regex to redact |

## Commit Format Styles

- `conventional`: `feat(scope): description`
- `angular`: `feat(scope): description`
- `gitmoji`: `🎉 commit message`
- `custom`: User-defined

## Architecture Summary

1. **Extension Host** registers webview and commands
2. **Webview UI** (React + Zustand) handles user interaction
3. **Orchestrator** runs compose pipeline:
   - Load staged diffs
   - Apply privacy filters (exclude/redact)
   - Call AI provider or heuristic fallback
   - Parse and return draft commits
4. **Commit Safety**: Snapshot validation prevents stale commits

## Error Handling

Errors are mapped via `mapErrorToUserMessage()` in `src/features/support/errorMapper.ts`:
- Auth failures → prompt for key
- Rate limits → exponential backoff
- Network failures → retry with fallback
- Stale snapshot → refresh action

## Privacy

- API keys stored in VS Code SecretStorage
- Diff content never leaves VS Code except to selected AI provider
- `excludePatterns` filters files before AI
- `redactPatterns` masks sensitive content
- Ollama runs fully local

## Testing

Tests use Mocha and are located in `src/test/suite/`.
Run with `pnpm run test`.

Common test files:
- `orchestrator.test.ts`
- `aiProvider.test.ts`
- `responseParser.test.ts`
- `commitExecutor.test.ts`
- `privacyPolicy.test.ts`

## Debugging

Enable debug mode in settings:
```json
{ "commitComposer.debugMode": true }
```

View debug logs via:
- `Commit Composer: Show Debug Logs` command
- VS Code Output panel (select "OpenGit Composer")