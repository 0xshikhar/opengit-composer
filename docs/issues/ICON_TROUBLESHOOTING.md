# Extension Logo Troubleshooting

This project uses the OpenGit Composer logo in two different places:

1. The VS Code extension metadata icon, shown in the Extensions view and marketplace.
2. The in-app webview logo, shown inside the sidebar and panel UI.

These are related, but they are not the same rendering path. A fix for one does not automatically fix the other.

## Symptoms

- The extension details card shows a generic blank box or a low-contrast square instead of the expected logo.
- The Activity Bar icon looks like an empty tile or disappears into the theme.
- The sidebar opens, but there is no visible OpenGit Composer mark inside the webview itself.

## Common Causes

### 1. SVG used in `package.json`

VS Code extension packaging via `vsce` rejects SVG icons in the extension manifest. If the manifest points to an SVG, packaging fails, even if the extension works in development.

### 2. Asset excluded by `.vscodeignore`

The extension package can only contain files that are not ignored. If the logo is referenced from `media/icon.png` but `.vscodeignore` excludes `**/*.png`, the packaged extension cannot load the file.

### 3. Different paths for different surfaces

The top-level `"icon"` field in `package.json` only affects the extension card and marketplace listing.

The `viewsContainers.activitybar.icon` field affects the Activity Bar container.

The webview UI is separate and must load its own image resource explicitly.

### 4. Webview resource restrictions

Webviews cannot directly read arbitrary files from disk. Images must be exposed through `webview.asWebviewUri(...)` and the target folder must be listed in `localResourceRoots`.

### 5. Theme and scaling issues

A logo that looks fine at 256 px can become unreadable at 16 px in the Activity Bar.

A dark logo on a dark theme can appear as a square or as a missing icon.

## Fix Applied

- The extension manifest now uses `icon.png` for the extension icon and Activity Bar icon.
- The webview now receives a `logoUri` and renders the brand mark directly in the sidebar/panel header.
- `media/icon.png` is explicitly kept in `.vscodeignore` so the in-webview image is available in the packaged VSIX.

## Practical Guidance

- Use a PNG for the extension manifest icon.
- Keep a dedicated webview logo if the UI needs a visible brand mark inside the extension.
- Prefer a logo that remains recognizable at small sizes.
- Always verify the packaged VSIX, not just the local development host.
