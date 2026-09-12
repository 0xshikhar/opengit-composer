# Release Process Guide

This document outlines the step-by-step process to release a new version of OpenGit Composer to the VS Code Marketplace.

---

## Overview

| Item | Details |
|------|---------|
| **Package Name** | `opengit-composer` |
| **Publisher** | `0xshikhar` |
| **Tool** | `@vscode/vsce` (via pnpm) |
| **Output** | `.vsix` file for manual install + Marketplace publish |

---

## Pre-Release Checklist

Before starting the release process, ensure:

- [ ] All changes for this release are committed to `main`
- [ ] Version number is updated in `package.json`
- [ ] Version is updated in documentation (`docs/STATUS.md`, `Readme.md`, `docs/README.md`)
- [ ] Changelog entry is prepared (if maintaining a changelog)
- [ ] No failing tests: `pnpm run lint && pnpm run test && pnpm run compile`
- [ ] Extension builds successfully: `pnpm run package`

---

## Release Steps

### Step 1: Update Version

Update version in all relevant files:

```bash
# Edit package.json - update "version" field
code package.json
```

Required files to update:
- `package.json` (version field)
- `docs/STATUS.md` (version in header)
- `Readme.md` (download link version)
- `docs/README.md` (download link version)

### Step 2: Verify Build

```bash
# Run full verification
pnpm run lint
pnpm run test
pnpm run compile
```

### Step 3: Build VSIX Package

```bash
# Build production bundle
pnpm run package

# Create VSIX for distribution
pnpm run package:vsix
```

Expected output: `opengit-composer-X.X.X.vsix` in project root

### Step 4: Test the VSIX Locally (Recommended)

```bash
# Install into VS Code for testing
code --install-extension opengit-composer-X.X.X.vsix
```

Verify:
- Extension loads in VS Code
- Sidebar opens correctly
- Basic compose flow works

### Step 5: Publish to Marketplace

**Option A: Publish with VSCE (requires publisher token)**

```bash
# Login to Azure (one-time setup)
pnpm exec vsce login 0xshikhar

# Publish (will prompt for token if not logged in)
pnpm exec vsce publish
```

**Option B: Manual Publish via Azure DevOps**

1. Go to: https://marketplace.visualstudio.com/manage/publishers/0xshikhar
2. Upload the `.vsix` file
3. Add release notes
4. Click "Publish"

### Step 6: Create GitHub Release

```bash
# Push version tag
git tag -a v2.0.5 -m "Release v2.0.5"
git push origin v2.0.5
```

Then create release on GitHub:
1. Go to: https://github.com/0xshikhar/opengit-composer/releases/new
2. Select the tag you just pushed
3. Add release notes describing changes
4. Attach the `.vsix` file
5. Publish release

---

## Post-Release

1. **Update README links** (if not already done)
2. **Announce** on social media / community channels
3. **Monitor** for user issues in the first 24-48 hours

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| VSCE not found | Ensure `@vscode/vsce` is in devDependencies |
| Auth failure | Run `pnpm exec vsce login 0xshikhar` |
| Build fails | Check webpack config and TypeScript errors |
| Extension not loading | Check VS Code developer console for errors |

---

## Quick Commands Reference

```bash
# Full release workflow
pnpm run lint && pnpm run test && pnpm run compile && pnpm run package:vsix
```

```bash
# Publish to marketplace (after building)
pnpm exec vsce publish
```

```bash
# Create a GitHub release with the VSIX attached
gh release create v2.0.5 --title "v2.0.5" --notes "Release notes here" ./opengit-composer-2.0.5.vsix
```