OpenGit Composer v2 — Professional Commit Intelligence System 0. Mission

Transform OpenGit Composer from a simple commit message generator into a professional Git intelligence layer similar to GitLens Commit Composer, but more powerful, extensible, and AI-native.

This becomes:

"The Linear / Cursor / GitLens of commit composition"

1. Core Principles

Design pillars:

• AI-native
• Diff-aware
• Multi-commit intelligent splitting
• Fully provider-agnostic
• Deterministic + reproducible
• Professional Git workflow aligned
• Extension-grade architecture

2. High-Level Architecture
   ┌──────────────────────────┐
   │ UI Layer │
   │ Commit Composer Panel │
   │ Diff Viewer │
   │ Commit Tree View │
   └────────────┬─────────────┘
   │
   ┌────────────▼─────────────┐
   │ Application Layer │
   │ Commit Orchestrator │
   │ Diff Analyzer │
   │ Commit Split Engine │
   │ AI Provider Manager │
   │ Git Command Layer │
   └────────────┬─────────────┘
   │
   ┌────────────▼─────────────┐
   │ Core Layer │
   │ Git Parser │
   │ Diff AST Generator │
   │ File Change Classifier │
   │ Commit Strategy Engine │
   └────────────┬─────────────┘
   │
   ┌────────────▼─────────────┐
   │ Provider Layer │
   │ OpenAI │
   │ Claude │
   │ Gemini │
   │ Kimi │
   │ Local models (Ollama) │
   └──────────────────────────┘
3. Core Features (v2 Required)
   3.1 Diff-Aware Commit Generation

Agent must:

• Read staged changes
• Parse diff
• Understand semantic change
• Generate professional commit

Example output:

feat(auth): add JWT refresh token flow

- add refresh token endpoint
- implement token rotation logic
- update middleware for refresh handling
- add expiry validation

Implementation tasks:

create module:

core/git/getStagedDiff.ts

use:

git diff --staged --patch --no-color
3.2 Intelligent Commit Splitting (CRITICAL)

This is GitLens-level feature.

Example staged changes:

auth.ts
dashboard.tsx
styles.css
api.ts

Expected output:

Commit 1:

feat(auth): implement login flow

Commit 2:

feat(dashboard): add dashboard UI

Commit 3:

style(ui): update global styling

Implementation:

core/commitSplitter.ts

algorithm:

1. parse diff by file
2. classify files by domain
3. cluster related files
4. generate commit per cluster
   3.3 Commit Tree Preview

UI must show:

Draft Commits

● feat(auth): implement login
files: auth.ts, token.ts

● feat(dashboard): add UI
files: dashboard.tsx

● refactor(api): improve request handling
files: api.ts

User can:

• edit commit message
• merge commits
• split commits
• reorder commits

3.4 Full AI Provider System

Support:

OpenAI
Claude
Gemini
Kimi
OpenRouter
Ollama
Custom endpoint

Interface:

providers/base.ts

interface AIProvider {
generateCommit(input: CommitInput): Promise<CommitOutput>
}
3.5 Professional Commit Standards

Support formats:

Conventional Commits
Angular
Semantic Release
Custom

Config:

.gitcomposer.json

Example:

{
"commitFormat": "conventional",
"maxSubjectLength": 72
} 4. Advanced GitLens-Level Features
4.1 Diff Viewer Integration

Show:

file tree

- inline diff
- file selection

Implementation:

Use:

monaco diff editor
4.2 Draft Commit Workflow

States:

Draft
Generated
Edited
Confirmed
Committed
4.3 Commit Confidence Score

AI returns:

confidence: 0.94

Based on:

• diff clarity
• semantic certainty

4.4 Context-Aware Generation

Provide AI:

repo name
branch name
recent commits
file types
project type
4.5 Commit History Learning

System learns style from:

last 100 commits 5. UI/UX Specification

Layout:

Left Panel:

- commit tree
- file tree

Center:

- diff viewer

Right:

- commit editor
- AI controls

Similar to GitLens screenshot.

6. Technical Stack

Recommended:

Frontend:

Next.js
React
Tailwind
Zustand
Monaco editor

Backend:

Node.js
simple-git
execa

Optional Rust core later.

7. Detailed Implementation Tasks

Give this entire section to coding agent:

Task 1 — Git Layer

Create:

core/git/gitService.ts

Functions:

getStagedFiles()
getDiff()
getFileDiff(file)
commit(message)
stageFiles(files)
unstageFiles(files)

Use:

simple-git
Task 2 — Diff Parser

Create:

core/parser/diffParser.ts

Output:

interface ParsedDiff {
files: FileChange[]
}
Task 3 — Commit Split Engine

Create:

core/commit/commitSplitter.ts

Logic:

cluster files by:

- folder
- feature name
- semantic similarity
  Task 4 — AI Provider Layer

Create:

providers/
openai.ts
claude.ts
gemini.ts
kimi.ts
ollama.ts
Task 5 — Commit Orchestrator

Create:

core/orchestrator.ts

Flow:

read diff
parse diff
split commits
generate commit messages
return draft commits
Task 6 — UI Commit Tree

Component:

components/CommitTree.tsx

Supports:

expand
edit
delete
merge
reorder
Task 7 — Diff Viewer

Component:

components/DiffViewer.tsx

Use:

monaco diff editor
Task 8 — Commit Execution Engine

Create:

core/commitExecutor.ts

Executes:

git add specific files
git commit
Task 9 — Config System

File:

.gitcomposer.json

Load dynamically.

8. Agent Execution Plan (Step-by-Step)

Phase 1

implement git service
implement diff parser
implement commit generator

Phase 2

implement commit splitter
implement AI providers

Phase 3

implement UI tree
implement diff viewer

Phase 4

implement commit execution

Phase 5

implement polish and UX 9. Advanced Features (10x Differentiators)

Add later:

Autonomous Commit Mode

Auto commits intelligently.

Commit Intent Detection

Understands:

feature
fix
refactor
style
docs
Cursor-Level Integration

Works inside editor automatically.

Local Model Mode

Use:

Qwen3-Coder
DeepSeek
Llama 10. Suggested Folder Structure
git-composer-v2/

core/
git/
parser/
commit/
providers/
orchestrator/

components/
CommitTree.tsx
DiffViewer.tsx
CommitEditor.tsx

hooks/

store/

types/

config/

app/
