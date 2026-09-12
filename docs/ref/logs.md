[INFO  2026-04-10T18:43:02.624Z] OpenGit Composer extension activated
[INFO  2026-04-10T18:43:02.624Z] CommitComposerProvider: Initialized
[INFO  2026-04-10T18:43:02.624Z] OpenGit Composer commands registered
[INFO  2026-04-10T18:43:04.297Z] CommitComposerProvider: resolveWebviewView called
[INFO  2026-04-10T18:43:04.298Z] ConfigLoader: Configuration loaded
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "commitFormat": "conventional"
}
[INFO  2026-04-10T18:43:04.443Z] ConfigLoader: Configuration loaded
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "commitFormat": "conventional"
}
[WARN  2026-04-10T18:43:37.567Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:38.507Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:39.173Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:39.409Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:39.632Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:39.870Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[WARN  2026-04-10T18:43:40.115Z] CommitComposerProvider: Unknown message command
{
  "source": "sidebar",
  "command": "openKeyInput"
}
[INFO  2026-04-10T18:47:41.826Z] GeminiProvider initialized
{
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:47:41.826Z] GeminiProvider: Validating API key
[INFO  2026-04-10T18:47:42.594Z] Orchestrator: Composing commits
{
  "fileCount": 5
}
[INFO  2026-04-10T18:47:42.611Z] GeminiProvider initialized
{
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:47:42.611Z] Orchestrator: Analyzing with AI
{
  "provider": "gemini",
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:47:42.611Z] GeminiProvider: Analyzing changes
{
  "fileCount": 5
}
[WARN  2026-04-10T18:47:45.800Z] GeminiProvider.makeRequest: transient AI request failure; retrying
{
  "attempt": 1,
  "maxAttempts": 3,
  "backoffMs": 476,
  "code": "ERR_BAD_RESPONSE",
  "status": 503,
  "message": "Request failed with status code 503"
}
[WARN  2026-04-10T18:47:50.285Z] GeminiProvider.makeRequest: transient AI request failure; retrying
{
  "attempt": 2,
  "maxAttempts": 3,
  "backoffMs": 890,
  "code": "ERR_BAD_RESPONSE",
  "status": 503,
  "message": "Request failed with status code 503"
}
[ERROR 2026-04-10T18:47:58.000Z] GeminiProvider: API request failed
Error: Request failed with status code 503
Stack: AxiosError: Request failed with status code 503
	at nt (/Users/shikharsingh/.windsurf/extensions/0xshikhar.opengit-composer-2.0.1/dist/extension.js:2:217358)
	at Unzip.<anonymous> (/Users/shikharsingh/.windsurf/extensions/0xshikhar.opengit-composer-2.0.1/dist/extension.js:2:232136)
	at Unzip.emit (node:events:519:28)
	at endReadableNT (node:internal/streams/readable:1698:12)
	at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
	at ma.request (/Users/shikharsingh...[truncated]
[ERROR 2026-04-10T18:47:58.000Z] Orchestrator: AI composition failed, falling back to heuristics
Error: Gemini API Error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
Stack: Error: Gemini API Error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
	at t.buildProviderError (/Users/shikharsingh/.windsurf/extensions/0xshikhar.opengit-composer-2.0.1/dist/extension.js:2:133376)
	at u.makeRequest (/Users/shikharsingh/.windsurf/extensions/0xshikhar.opengit-composer-2.0.1/dist/extension.js:2:119129)
	at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
	at async u.analyzeChange...[truncated]
[INFO  2026-04-10T18:48:07.275Z] GeminiProvider initialized
{
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:48:07.275Z] GeminiProvider: Validating API key
[INFO  2026-04-10T18:48:08.497Z] Orchestrator: Composing commits
{
  "fileCount": 5
}
[INFO  2026-04-10T18:48:08.512Z] GeminiProvider initialized
{
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:48:08.512Z] Orchestrator: Analyzing with AI
{
  "provider": "gemini",
  "model": "gemini-2.5-flash"
}
[INFO  2026-04-10T18:48:08.512Z] GeminiProvider: Analyzing changes
{
  "fileCount": 5
}
[WARN  2026-04-10T18:48:10.712Z] GeminiProvider.makeRequest: transient AI request failure; retrying
{
  "attempt": 1,
  "maxAttempts": 3,
  "backoffMs": 409,
  "code": "ERR_BAD_RESPONSE",
  "status": 503,
  "message": "Request failed with status code 503"
}
[WARN  2026-04-10T18:48:18.249Z] GeminiProvider.makeRequest: transient AI request failure; retrying
{
  "attempt": 2,
  "maxAttempts": 3,
  "backoffMs": 891,
  "code": "ERR_BAD_RESPONSE",
  "status": 503,
  "message": "Request failed with status code 503"
}
[INFO  2026-04-10T18:48:38.115Z] ResponseParser: Parsed AI response using structured JSON
{
  "groups": 2
}
[INFO  2026-04-10T18:48:38.116Z] Orchestrator: AI generated drafts
{
  "count": 2
}