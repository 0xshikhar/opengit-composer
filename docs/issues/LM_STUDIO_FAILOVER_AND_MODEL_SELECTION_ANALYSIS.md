# Root Cause Analysis: LM Studio "Model Failover" False Positive & Model Selection

## 1. Problem Description
When using LM Studio with a local model (e.g., `qwen3.5-4b-claude-4.6-opus-reasoning-distilled`), users observed:
1. An alarming orange warning in the Composer workspace:
   `AI model failover active: qwen3.5-4b-claude-4.6-opus-reasoning-distilled switched to qwen3.5-4b-claude-4.6-opus-reasoning-distilled. LM Studio request retried without response_format for compatibility.`
2. A `MODEL FAILOVER` badge in the status bar.
3. The provider card at the top displaying `Model: Default` rather than identifying the currently active loaded local model.
4. Despite the "failover" warning, the model actually produced valid draft commits and composition reasoning.

---

## 2. Root Cause Analysis

### Cause 1: Inappropriate `failover: true` Flag on Compatibility Retry (`src/ai/providers/lmstudio.ts`)
- In `LMStudioProvider.makeRequest()`, OpenGit Composer first attempts an OpenAI-compatible chat completion with `response_format: { type: 'json_object' }`.
- Many local models in LM Studio (and certain quantized models or older LM Studio server versions) do not support constrained grammar/JSON schema mode, throwing HTTP 400 or schema validation errors.
- `LMStudioProvider` correctly caught this error (`isResponseFormatError`) and executed a second request without `response_format`, which succeeded.
- **The Bug:** Inside the retry block, the provider populated metadata as:
  ```ts
  this.requestMeta = {
      requestedModel: model,
      usedModel: model,
      failover: true, // <-- BUG: flags model failover even though model didn't change!
      failoverReason: 'LM Studio request retried without response_format for compatibility.',
  };
  ```
  `failover: true` is reserved for when an AI model could not be served and was switched to a *different* fallback model (e.g. Gemini Pro to Flash). Because `requestedModel` and `usedModel` were the same model, the UI formatted this as:
  `${requestedModel} switched to ${usedModel}` -> `X switched to X`.

### Cause 2: UI Lacked Guard for Identical Model Failovers (`ComposeWorkspace.tsx` & `StatusBar.tsx`)
- In `ComposeWorkspace.tsx`:
  ```tsx
  {modelFailover && (
      <p className="compose-summary compose-summary-warning">
          AI model failover active: {requestedModel || 'primary model'} switched to {usedModel || 'a fallback model'}.
      </p>
  )}
  ```
  The UI checked `composeMeta?.aiModelFailover` without verifying whether `requestedModel !== usedModel`.

### Cause 3: Inefficient Retry on Every Request
- `LMStudioProvider` did not cache whether a host or model supports `response_format`. Every single compose execution would fail on attempt 1, wait for the error response, and only then retry on attempt 2 without `response_format`.
- This introduced unnecessary latency and cluttered server logs with 400 Bad Request errors.

### Cause 4: Provider Card Displayed `Model: Default` for Local Models (`AIControls.tsx`)
- In `AIControls.tsx`, when `providerConfig.model` was empty (`""`), the provider summary card rendered:
  `Model: {providerConfig.model || 'Default'}`
- For local providers (LM Studio & Ollama), an empty model string means "use the currently active / loaded model on the local server". Displaying "Default" led users to believe the extension was not detecting their loaded model.

---

## 3. Resolution Plan

1. **`src/ai/providers/lmstudio.ts`**:
   - Set `failover: false` when only request parameters (`response_format`) are adapted, keeping `requestedModel` and `usedModel` aligned.
   - Cache `response_format` incompatibility per `baseUrl:model` so subsequent requests skip the failing attempt and execute directly.
2. **`src/core/orchestrator.ts`**:
   - Strictly require `requestedModel !== usedModel` for `aiModelFailover: true`.
3. **`src/webview/ui/components/ComposeWorkspace.tsx` & `StatusBar.tsx`**:
   - Only activate model failover banners and badges when the model actually switched (`requestedModel !== usedModel`).
4. **`src/webview/ui/components/AIControls.tsx`**:
   - For local providers (LM Studio and Ollama), display `Model: Active (modelName)` when using the loaded model.
