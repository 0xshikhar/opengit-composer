# OpenGit Composer V2

**OpenGit Composer** is a VS Code extension that intelligently groups your staged changes into semantic, atomic commits using AI.

Say goodbye to massive, unstructured commits. Let OpenGit Composer act as your personal AI git assistant from the VS Code Activity Bar and composer panel.

> Screenshot update in progress: current UX is Activity Bar container + optional full panel workspace.

## ✨ New in V2

- **Integrated Sidebar Experience:** OpenGit Composer lives in its own Activity Bar container (`OpenGit Composer`) with a dedicated compose workspace.
- **Bring Your Own Model:** First-class support for multiple LLMs:
  - OpenAI (GPT-4o, GPT-4)
  - Anthropic (Claude 3 Opus/Sonnet/Haiku)
  - Google (Gemini Pro)
  - Moonshot (Kimi)
  - Ollama (Local open-source models!)
- **Intelligent Splitter Engine:** Advanced heuristic file clustering chunks your changes by domain (`auth`, `api`, `ui`, `core`), generating distinct atomic commits.
- **GitLens-Quality UI:** A beautiful, responsive dark-themed interactive tree view built with React. Native diff viewer, inline commit editors, and drag-and-drop support.
- **Batch Execution:** Safely review the AI's structured commit plan and execute them all in sequence with a single click.

## 🚀 Features

- **🤖 AI-Powered Analysis:** Automatically parses git diffs to generate semantic commit groupings and accurate commit messages.
- **🧩 Logical Grouping:** Even without AI, the heuristic clustering groups related file changes into cohesive commit units.
- **👀 Interactive Review:** Clearly view staged files, proposed groups, and syntax-highlighted diffs before committing.
- **🛠️ Manual Control:** Inline editing allows you to tweak the suggested commit message, edit the prefix, and manually combine/split files.

## 📦 Installation

1. Open **VS Code**.
2. Go to the **Extensions** view (`Cmd+Shift+X` or `Ctrl+Shift+X`).
3. Search for **OpenGit Composer**.
4. Click **Install**.
   _(Currently available via VSIX deployment: `code --install-extension git-composer-v2-0.0.1.vsix`)_

## 📖 Usage

1. **Stage your changes** in the Source Control view as usual.
2. Open the **OpenGit Composer** icon in the left **Activity Bar**.
3. If you have no provider set, use the built-in Settings UI to pick an AI provider and enter your API Key.
4. Click the **Sparkle / Compose** button to let the AI analyze your staged diffs.
5. Review the generated **Draft Commits** in the interactive tree.
6. Click **Commit** on a group, or click **Commit All** to dispatch the queue sequentially.

## ⚙️ Configuration

OpenGit Composer is highly customizable. Configure it via VS Code Settings (`Cmd+,`) or a local `.gitcomposer.json` file in your workspace root!

| Setting                           | Description                                                            | Default                  |
| :-------------------------------- | :--------------------------------------------------------------------- | :----------------------- |
| `commitComposer.aiProvider`       | Select the AI provider (OpenAI, Anthropic, Gemini, Kimi, Ollama)       | `openai`                 |
| `commitComposer.apiKey`           | Your API Key for the selected provider                                 | `""`                     |
| `commitComposer.model`            | Specific model to use (e.g., `gpt-4o`, `claude-3-opus`)                | _provider default_       |
| `commitComposer.ollamaHost`       | Local host domain when using Ollama                                    | `http://localhost:11434` |
| `commitComposer.commitFormat`     | Commit message format (`conventional`, `angular`, `gitmoji`, `custom`) | `conventional`           |
| `commitComposer.maxSubjectLength` | Maximum character length for commit subject line                       | `72`                     |
| `commitComposer.splitThreshold`   | Number of files above which the splitter groups into multiple commits  | `3`                      |
| `commitComposer.excludePatterns`  | Glob patterns excluded from AI compose inputs                          | `[]`                     |
| `commitComposer.redactPatterns`   | Regex patterns redacted before AI requests                             | `[]`                     |

## 🔑 Your Data & Privacy

To use the AI generation, you provide an API key for your chosen cloud provider.

- Your API key is stored securely in your local VS Code settings and never transmitted to our servers.
- The Git Repository Diff is sent directly to your chosen provider (OpenAI/Anthropic/Google).
- You can exclude files or redact sensitive strings using `excludePatterns` and `redactPatterns`.
- **100% Privacy Option:** Select **`ollama`** as your provider to keep all code analysis completely offline and local on your machine!

---

**Enjoying OpenGit Composer V2?** Leave a review on the marketplace!
