# Pre-Commit Hooks Guide

This project uses **Husky** and **lint-staged** to automatically check your code before commits. This ensures code quality, security, and consistency.

## What Gets Checked?

### 🔒 Pre-Commit Hook (`.husky/pre-commit`)

Runs automatically before every commit:

1. **Prevents .env files from being committed**
   - Blocks `.env`, `.env.local`, `.env.keys` files
   - These contain secrets and should never be in git
   - Use dotenvx to manage encrypted environment files

2. **Detects hardcoded secrets**
   - Scans for patterns like `password=`, `secret:`, `api_key`, `token`, etc.
   - Prevents accidental credential leaks
   - Can bypass with `--no-verify` if needed (not recommended)

3. **Runs ESLint on staged files**
   - Auto-fixes fixable issues (spacing, formatting)
   - Reports unfixable issues that must be manually corrected
   - Uses security-focused ESLint configuration
   - Fails commit if errors found

4. **Validates package-lock.json sync**
   - If `package.json` changes, `package-lock.json` must also change
   - Ensures dependency lockfile stays in sync
   - Prevents inconsistent installs

### 💬 Commit Message Hook (`.husky/commit-msg`)

Validates commit messages for clarity:

- **Minimum 10 characters** for simple messages
- **Recommended format**: `<type>(<scope>): <subject>`
  - Examples:
    - `feat(auth): add JWT token refresh`
    - `fix(validation): handle null values correctly`
    - `security: fix SQL injection vulnerability`
    - `docs(readme): update installation steps`

- **Valid types**: feat, fix, docs, style, refactor, perf, test, chore, security, ci

## Installation

The hooks are automatically installed when you run:

```bash
npm install
```

This runs the `prepare` script which executes `husky install`.

## Usage

### Normal Workflow

```bash
# Make changes
git add src/auth/jwt.js

# Try to commit
git commit -m "fix(jwt): improve token validation"

# Pre-commit hook runs automatically:
# 1. Checks for .env files
# 2. Scans for hardcoded secrets
# 3. Runs ESLint (auto-fixes some issues)
# 4. Checks package-lock.json
# 5. Validates commit message
# If all pass, commit succeeds!
```

### Fixing ESLint Issues

If ESLint fails:

```bash
# Review the errors
npm run lint

# Fix automatically (some issues only)
npx eslint src --fix

# Stage the fixed files
git add src/

# Try commit again
git commit -m "fix: lint issues"
```

### Bypassing Hooks (Dangerous!)

**Only use if absolutely necessary:**

```bash
# Bypass all pre-commit checks
git commit --no-verify -m "fix: emergency patch"

# Bypass only the commit message check
git commit -m "wip: work in progress"  # Triggers "wip" bypass
```

⚠️ **Never bypass the .env file check!**

## Configuration

### ESLint Rules

Located in `.eslintrc.cjs` (if you create one). The default setup includes:
- Security plugin checks
- Best practices
- No hardcoded secrets

### Lint-Staged Config

In `package.json`:

```json
"lint-staged": {
  "src/**/*.js": [
    "eslint --fix",
    "eslint"
  ],
  ".env*": [
    "git rm --cached"
  ]
}
```

## Troubleshooting

### "Command not found: husky"

```bash
npm install
# or
npm ci
```

### Hooks not running

```bash
# Reinstall hooks
npm run prepare
# or
npx husky install
```

### ESLint keeps failing

```bash
# Check all files
npm run lint

# Fix what you can
npx eslint src --fix

# See remaining issues
npm run lint
```

### Need to update .env.local

1. Update your `.env.local` locally (don't commit)
2. Use dotenvx to encrypt it:
   ```bash
   dotenvx encrypt .env.local
   ```
3. The `.env.keys` file is what you commit for team sharing

### Accidentally committed .env

```bash
# Remove from git history (careful!)
git rm --cached .env
git commit -m "chore: remove .env from tracking"

# Add to .gitignore if not already there
echo ".env*" >> .gitignore
git add .gitignore
git commit -m "chore: add .env to gitignore"

# Force push if needed (only if no one else pulled)
git push --force-with-lease
```

## Pre-Commit Checks Summary

| Check | Type | Bypass | Risk |
|-------|------|--------|------|
| .env files blocked | 🔒 Error | ❌ No | Critical - Secrets leak |
| Hardcoded secrets | ⚠️ Warning | ✓ Yes | High - Credentials exposed |
| ESLint | ⚠️ Warning | ✓ Yes | Medium - Code quality |
| package-lock.json sync | 🔒 Error | ❌ No | High - Version inconsistency |
| Commit message format | ⚠️ Warning | ✓ Yes | Low - History clarity |

## Best Practices

1. **Always fix ESLint issues locally**
   - Don't bypass lint checks
   - Better code quality = fewer bugs

2. **Never bypass .env checks**
   - This prevents accidental secret leaks
   - Use dotenvx for team secrets

3. **Write meaningful commit messages**
   - Helps with git history and debugging
   - Team members can understand changes

4. **Keep dependencies updated**
   - Always run `npm install` after modifying `package.json`
   - Hooks prevent out-of-sync lockfiles

## Learn More

- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/lint-staged/lint-staged)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Conventional Commits](https://www.conventionalcommits.org/)
