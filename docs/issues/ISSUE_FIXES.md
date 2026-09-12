# Issue Fixes Summary

This document describes the 4 issues that were identified and fixed in the OpenGit Composer extension.

## Issue 1: Full Panel View

### Problem
The extension only had a sidebar view which was compact and limited in size. Users needed a full-width panel option for better visibility when working with multiple commits.

### Solution
- The panel already existed via `openComposerPanel` method in `CommitComposerProvider.ts`
- Added "Open In Full Panel" button in the sidebar UI that opens the full-width panel
- Panel uses `retainContextWhenHidden: true` to preserve state

### Files Changed
- `src/webview/ui/App.tsx` - Added conditional button for panel mode

---

## Issue 2: Auto-save Provider Selection

### Problem
When users switched AI providers (OpenAI, Anthropic, Gemini, etc.), the selection was not persisted. On next extension load, it would reset to the default.

### Solution
- Added `saveProviderPreference` handler in `CommitComposerProvider.ts`
- When provider changes, it saves to VS Code settings via `vscode.workspace.getConfiguration('commitComposer').update('aiProvider', ...)`
- On load, `ConfigLoader` reads provider from VS Code settings

### Files Changed
- `src/webview/CommitComposerProvider.ts` - Added `handleSaveProviderPreference` method
- `src/webview/ui/hooks/useVSCodeAPI.ts` - Added `saveProviderPreference` function
- `src/webview/ui/components/AIControls.tsx` - Call save on provider change

### Code Pattern
```typescript
// Save preference when switching provider
const handleProviderChange = (provider: string) => {
    setProviderConfig({ provider, model: '', apiKey: '' });
    saveProviderPreference(provider, '', providerConfig.baseUrl || '');
};
```

---

## Issue 3: Auto-save Model Selection

### Problem
When users selected a specific model (e.g., gpt-4o, claude-sonnet-4-20250514), it was not remembered across sessions. Each time they used the extension, it would reset to "Default".

### Solution
- Added model saving alongside provider preference
- When model changes, it's saved to VS Code settings via `vsConfig.update('model', model, true)`
- On load, `ConfigLoader` reads model from settings and passes it to webview

### Files Changed
- Same as Issue 2 - integrated into `saveProviderPreference`

### Code Pattern
```typescript
// Save preference when switching model
const handleModelChange = (model: string) => {
    setProviderConfig({ model });
    saveProviderPreference(providerConfig.provider, model, providerConfig.baseUrl || '');
};
```

---

## Issue 4: Secure API Key Handling

### Problem
API keys were visible in the UI input field even after saving. This was a security concern as:
1. Keys were stored in plain text in memory
2. Keys appeared in the input field after saving

### Solution
- Removed the direct API key input field from the UI
- Users must use "+ Add Key" button to add keys to secure storage
- Keys are stored in VS Code's secure secrets storage (`context.secrets.store`)
- Only masked display is shown (e.g., `sk-****...abcd`)

### Security Flow
1. User clicks "+ Add Key" → Input field appears
2. User enters key and clicks "Save" → Key stored in secrets
3. Key is never shown again, only masked version
4. Key rotation uses secrets, not visible input

### Files Changed
- `src/webview/ui/components/AIControls.tsx` - Removed direct input, added "Add Key" flow
- `src/webview/ui/index.css` - Added styling for empty state

### UI Behavior
- **No keys**: Shows "No API key set. Add one above to enable AI compose."
- **Has keys**: Shows masked keys with remove button and "+ Add Key" option
- **Add Key flow**: Shows password input and optional label input

---

## Technical Implementation Details

### Settings Storage
All preferences are stored in VS Code workspace settings:
- `commitComposer.aiProvider` - Selected AI provider
- `commitComposer.model` - Selected model
- `commitComposer.ollamaHost` - Ollama host URL (for local models)

### Secrets Storage
API keys are stored in VS Code's secure secrets:
- Uses `ExtensionContext.secrets.store()` for storage
- Keys are never exposed to the webview UI
- Only masked display values are sent to webview

---

## Issue 5: AI Request Failures - Prompt Size Bug

### Problem
The AI compose feature was failing with `ai_request_failed` fallback mode even with valid Gemini 2.5 Flash API keys. The root cause was NOT the model or API key itself, but the prompt size.

The staged `dist/*.js` files are minified and often collapse into very long single lines. The original prompt truncation only limited by line count, so those files were still sending huge chunks of text to Gemini (even thousands of characters on a single line). This pushed the request over the token limit, causing API failures.

### Diagnosis
- Error appeared as `ai_request_failed` - the app fell back to heuristic draft mode
- Gemini 2.5 Flash and API keys were valid
- Provider/model configuration was correct
- Actual issue: oversized prompts due to minified build artifacts in `dist/`

### Solution
Updated `src/ai/promptBuilder.ts` so diffs are truncated by BOTH:
- Line count (existing)
- **Character count (new)** - ensures minified files are safely cut off even on single long lines

### Files Changed
- `src/ai/promptBuilder.ts` - Added character count truncation alongside line count

### Code Pattern
```typescript
// Before: Only line count truncation
const MAX_LINES = 5000;
const truncated = lines.slice(0, MAX_LINES).join('\n');

// After: Both line AND character count truncation
const MAX_LINES = 5000;
const MAX_CHARS = 50000;
const truncated = lines.slice(0, MAX_LINES).join('\n').slice(0, MAX_CHARS);
```

### Verification
```bash
pnpm exec tsc -p . --noEmit
pnpm compile
```

### Impact
- Gemini 2.5 Flash with existing keys now works correctly
- Provider/model changes were not the real blocker
- The fix ensures minified bundle files don't overflow prompts

### Future Hardening (If Needed)
If failures still occur, the next step would be to treat `dist/` and source maps as low-priority input and summarize or skip them automatically before sending the request.

---

### Message Contract
New message type added:
- `saveProviderPreference` - Saves provider/model/baseUrl to settings
- `providerPreferenceSaved` - Confirmation response from host