# Contributing to OpenGit Composer

First off, thank you for considering contributing to OpenGit Composer! 🎉 It's people like you that make open source tools incredible.

## Code of Conduct

By participating in this project, you agree to abide by welcoming, inclusive, and constructive community standards.

## How Can I Contribute?

### 1. Reporting Bugs & Requesting Features
- Please search existing [GitHub Issues](https://github.com/0xshikhar/opengit-composer/issues) before opening a new one.
- Use the provided [Bug Report](https://github.com/0xshikhar/opengit-composer/issues/new?template=bug_report.yml) or [Feature Request](https://github.com/0xshikhar/opengit-composer/issues/new?template=feature_request.yml) templates.

### 2. Finding Good First Issues
Look for issues with the `good first issue` or `help wanted` labels. These are well-scoped tasks ideal for new contributors.

### 3. Development Setup
OpenGit Composer uses `pnpm` (or `bun`).

```bash
# Clone the repository
git clone https://github.com/0xshikhar/opengit-composer.git
cd opengit-composer/git-composer

# Install dependencies (do not use npm)
pnpm install

# Compile & watch changes
pnpm run watch

# Run tests
pnpm test
```

### 4. Submitting a Pull Request
1. Fork the repo and create your branch from `main` or latest release branch.
2. If you've added code that should be tested, add unit tests.
3. Ensure the test suite passes locally.
4. Open a Pull Request referencing the related issue.
5. In your GitHub profile, make sure your **Company / Organization** is visible if you represent a team or organization—this supports our project's open-source health metrics!

## Development Guidelines
- Follow conventional commits format (`feat:`, `fix:`, `docs:`, `chore:`).
- Keep pull requests focused on a single change or fix.
