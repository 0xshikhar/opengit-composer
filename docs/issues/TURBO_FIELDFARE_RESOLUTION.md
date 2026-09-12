# Root Cause Analysis: TurboFieldfare Model Resolution Failure & Fix Architecture

## 1. Executive Summary

When using the TurboFieldfare endpoint (`http://127.0.0.1:8080/v1`), the user encountered:
```
AI request failed for scratch/gemma4.gturbo (404 ERR_BAD_REQUEST)
LM Studio API Error: requested model is not available (code: model_not_found)
```
Even though:
1. The TurboFieldfare server was actively running in the background.
2. "Test Connection" passed.
3. Earlier, when pointing to the Turbo endpoint inside the generic "LM Studio" setting, Auto-Compose worked fine.

This document identifies the exact technical reason for this discrepancy, documents the diagnosis with live reproduction data, and details the canonical model resolution fix and version 3.0.0 upgrade.

---

## 2. Live Diagnostics & Reproduction

The TurboFieldfare server was started with:
```bash
.build/release/TurboFieldfareServer \
  --model scratch/gemma4.gturbo \
  --port 8080 \
  --max-context 16384
```

### Server Announcement:
```
TurboFieldfareServer ready at http://127.0.0.1:8080 model=gemma-4-26b-a4b-it context=16384
```

### Diagnostic 1: Querying Available Models
```bash
curl -s http://127.0.0.1:8080/v1/models
```
**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "object": "model",
      "id": "gemma-4-26b-a4b-it",
      "owned_by": "turbofieldfare",
      "created": 0
    }
  ]
}
```
Notice that the server's registered model ID is **`gemma-4-26b-a4b-it`**, NOT the file path `scratch/gemma4.gturbo`.

### Diagnostic 2: Sending Chat Completion with File Path
```bash
curl -s -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"scratch/gemma4.gturbo","messages":[{"role":"user","content":"hi"}]}'
```
**Response:**
```json
{
  "error": {
    "param": "model",
    "message": "requested model is not available",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```
HTTP Status: **404**. TurboFieldfare strictly validates that the incoming `model` parameter matches its registered model ID.

### Diagnostic 3: Sending Chat Completion with Canonical Model ID
```bash
curl -s -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma-4-26b-a4b-it","messages":[{"role":"user","content":"say pong"}]}'
```
**Response (HTTP 200 OK):**
```json
{
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": { "role": "assistant", "content": "pong" }
    }
  ],
  "model": "gemma-4-26b-a4b-it"
}
```

---

## 3. The Core Discrepancy: Why LM Studio Mode Worked vs. Turbo Preset

### Why LM Studio Setting Worked:
In the generic LM Studio setting, the `model` setting is typically left blank (`""`).
In `src/ai/providers/lmstudio.ts`:
```ts
private async resolveModel(): Promise<string> {
    const explicit = (this.config.model || '').trim();
    const models = await this.getAvailableModels();
    const active = models[0]?.trim();

    if (explicit) {
        ...
    }

    if (active) {
        return active; // Returned "gemma-4-26b-a4b-it"!
    }
}
```
Because `explicit` was empty, `resolveModel()` fell through to `if (active) return active;`, which sent `"gemma-4-26b-a4b-it"` to TurboFieldfare. The server gladly accepted it.

### Why TurboFieldfare Preset Failed:
When the TurboFieldfare preset was introduced, its default configuration was populated with `model: 'scratch/gemma4.gturbo'` (based on the CLI flag).
When `providerConfig.model` was `'scratch/gemma4.gturbo'`:
1. `validateModelAvailability()` called `modelIdsMatch('scratch/gemma4.gturbo', 'gemma-4-26b-a4b-it')`.
   - `modelIdsMatch` normalized `scratch/gemma4.gturbo` to `gemma4` and `gemma-4-26b-a4b-it` to `gemma426ba4bit`.
   - It saw `gemma426ba4bit.includes('gemma4') === true`.
   - Result: Test connection succeeded!
2. BUT when the user clicked "Auto-Compose Commits":
   ```ts
   if (explicit) {
       if (models.some(m => modelIdsMatch(explicit, m))) {
           return explicit; // <-- BUG! Returned "scratch/gemma4.gturbo"
       }
   ```
   `resolveModel()` returned the user's alias string `explicit` (`"scratch/gemma4.gturbo"`) instead of the server's canonical ID (`"gemma-4-26b-a4b-it"`).
3. The HTTP request sent `{"model": "scratch/gemma4.gturbo"}` to TurboFieldfare, which failed with HTTP 404 `model_not_found`.

---

## 4. Resolution Architecture

### 1. Canonical Model Resolution in `lmstudio.ts`
`resolveModel()` must NEVER return an explicit file path or alias when communicating with the server:
- If `explicit` matches any model in `models` (exact or fuzzy via `modelIdsMatch`), **always return the matching server model ID (`matched`)**.
- If the server has a single loaded model (`models.length === 1 && active`), and `explicit` is not recognized, **fallback to `active`** rather than failing.
- If `explicit` contains path separators (`/`, `\`) or ends with model file extensions (`.gturbo`, `.gguf`, `.bin`, `.safetensors`), treat it as an alias and resolve to `active`.

### 2. Preset Model Sanitization
In `src/utils/constant.ts`:
- `DEFAULT_LOCAL_ENDPOINTS`: TurboFieldfare preset has `model: ''` so that it naturally uses the server-reported active model (`gemma-4-26b-a4b-it`).

### 3. UI Auto-Sanitization
In `AIControls.tsx` and `AIProviderSettingsModal.tsx`:
- When displaying the active local model, if `providerConfig.model` is a file path (`scratch/...` or ends with `.gturbo`), display the active server model (e.g. `gemma-4-26b-a4b-it`).
- If saved preference contains a file path, gracefully sanitize it to empty or the active server model.

### 4. Version 3.0.0 Upgrade
- Update `package.json` to `"version": "3.0.0"`.
- Update `opengit-landing-page/app/page.tsx` hero badge to `v3.0.0 is live`.
- Update `git-composer/readme.md` download links and installation instructions to `opengit-composer-3.0.0.vsix`.
- Compile and package `opengit-composer-3.0.0.vsix`.
