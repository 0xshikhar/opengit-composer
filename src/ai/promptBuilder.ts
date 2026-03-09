import { FileChange, RepoContext } from '../types/git';
import { AIAnalyzeOptions } from './aiProvider';

export class PromptBuilder {
    static buildGroupingPrompt(changes: FileChange[], options: AIAnalyzeOptions = {}): string {
        const context = options.context;
        const commitFormat = options.commitFormat || 'conventional';
        const maxSubjectLength = options.maxSubjectLength || 72;
        const splitThreshold = options.splitThreshold || 3;
        const additionalInstructions = (options.additionalInstructions || '').trim();

        const filesInfo = changes.map(change => ({
            path: change.path,
            changeType: change.changeType,
            additions: change.additions,
            deletions: change.deletions,
            diffExcerpt: this.truncateDiff(change.diff, 60)
        }));

        const contextBlock = this.buildContextBlock(context);
        const additionalBlock = additionalInstructions
            ? `\nExtra user instructions:\n${additionalInstructions}\n`
            : '';

        return `You are a staff engineer generating a high-quality commit composition plan.

Goal:
- Group staged files into semantically coherent commits.
- Produce detailed reasoning and reviewer-friendly summaries.
- Keep commits atomic and easy to understand.

${contextBlock}
Commit style target:
- Format mode: ${commitFormat}
- Max subject length: ${maxSubjectLength}
- Suggested split threshold: ${splitThreshold}

${additionalBlock}
Staged files:
${JSON.stringify(filesInfo, null, 2)}

You MUST output a single valid JSON object and nothing else.
No markdown, no code fences, no prose outside JSON.

Required JSON schema:
{
  "summary": "1-3 sentence overview of the overall change set",
  "reasoning": "why these groups were chosen and tradeoffs",
  "groups": [
    {
      "files": ["exact/path/from/input.ts"],
      "type": "feat|fix|refactor|docs|style|test|chore|perf|ci|build",
      "scope": "optional-scope",
      "subject": "imperative summary without trailing period",
      "body": "optional multiline body",
      "confidence": 0,
      "rationale": "why these files belong together",
      "impact": "user/dev impact in 1-2 sentences",
      "verification": [
        "specific checks a reviewer can run"
      ],
      "risks": [
        "possible regressions or migration concerns"
      ]
    }
  ]
}

Hard rules:
1. Every file must appear exactly once across all groups.
2. Use exact file paths from input. Do not invent files.
3. If there is only one logical group, still return one group.
4. Keep confidence in [0, 100].
5. Keep subject <= ${maxSubjectLength} chars.
6. Prefer 2-7 commits unless the change set is clearly atomic.
7. If unsure, choose safer grouping and explain uncertainty in "reasoning".`;
    }

    static buildMessagePrompt(files: FileChange[], context?: RepoContext): string {
        const filesInfo = files.map(f => ({
            path: f.path,
            type: f.changeType,
            additions: f.additions,
            deletions: f.deletions,
            diff: this.truncateDiff(f.diff, 50)
        }));

        let contextBlock = '';
        if (context) {
            contextBlock = `\nRepository: ${context.repoName} | Branch: ${context.branch}\n`;
        }

        return `Generate a clear, conventional commit message for these changes:
${contextBlock}
${JSON.stringify(filesInfo, null, 2)}

Format: <type>(<scope>): <subject>

<body>

Where:
- type: feat, fix, refactor, docs, style, test, chore
- scope: optional, affected module/component
- subject: imperative mood, lowercase, no period
- body: optional, explain what and why (not how)

Return only the commit message, no JSON.`;
    }

    static buildRepairPrompt(
        rawModelOutput: string,
        changes: FileChange[],
        options: AIAnalyzeOptions = {}
    ): string {
        const commitFormat = options.commitFormat || 'conventional';
        const maxSubjectLength = options.maxSubjectLength || 72;
        const filePaths = changes.map(change => change.path);
        const truncatedRaw = rawModelOutput.length > 12000
            ? `${rawModelOutput.slice(0, 12000)}\n... (truncated)`
            : rawModelOutput;

        return `Convert the previous model output into valid JSON for commit composition.

Rules:
1. Output ONLY a single valid JSON object.
2. Preserve intent from the previous output as much as possible.
3. Every file must appear exactly once across groups.
4. Use only these exact file paths:
${JSON.stringify(filePaths, null, 2)}
5. Commit format target: ${commitFormat}
6. Subject max length: ${maxSubjectLength}

Required schema:
{
  "summary": "string",
  "reasoning": "string",
  "groups": [
    {
      "files": ["path/from/list.ts"],
      "type": "feat|fix|refactor|docs|style|test|chore|perf|ci|build",
      "scope": "optional",
      "subject": "string",
      "body": "optional",
      "confidence": 0,
      "rationale": "optional",
      "impact": "optional",
      "verification": ["optional checks"],
      "risks": ["optional risks"]
    }
  ]
}

Previous invalid output:
${truncatedRaw}`;
    }

    private static buildContextBlock(context?: RepoContext): string {
        if (!context) return 'Repository context: not provided.\n';

        const recentCommits = context.recentCommits
            .slice(0, 8)
            .map(c => `- ${c}`)
            .join('\n');

        return `Repository context:
- Repository: ${context.repoName}
- Branch: ${context.branch}
- Project Type: ${context.projectType}
- Recent commits:
${recentCommits || '- none'}\n`;
    }

    private static truncateDiff(diff: string, maxLines: number): string {
        const lines = diff.split('\n');
        if (lines.length <= maxLines) {
            return diff;
        }
        return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
    }

    static estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}
