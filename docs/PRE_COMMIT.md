# Pre-Commit Hooks

Husky runs two hooks before a commit lands. They are installed by `npm install`
(the `prepare` script runs `husky install`), so a fresh clone gets them for free.

## `.husky/pre-commit`

Four checks, in order. Any failure aborts the commit.

| # | Check | What it does | Fails the commit |
|---|---|---|---|
| 1 | `.env` files | Refuses a staged `.env`, `.env.local` or `.env.keys` | Yes |
| 2 | Hardcoded secrets | Greps added lines for `secret`/`api_key`/`private_key`/`token`/`password` assigned a literal of 8+ characters | Yes |
| 3 | `lint-staged` | ESLint with `--fix`, then ESLint again, on staged `src/**/*.js` | Yes, on any remaining error |
| 4 | Lockfile sync | If the staged `package.json` changed a dependency block, demands a staged `package-lock.json` | Yes |

Notes on the two that surprise people:

**Check 2** skips lines that look like schema, example, test or comment code, so
`z.string()` and a documented placeholder do not trip it. A real false positive
is possible; see *Bypassing* below.

**Check 4** compares the `dependencies`, `devDependencies`,
`optionalDependencies`, `peerDependencies` and `overrides` blocks between the
staged file and `HEAD`. It used to fire on any `package.json` edit, which made a
version bump or a `scripts` change impossible to commit — `npm install` produces
no lockfile diff for those, so there was nothing to stage.

## `.husky/commit-msg`

Accepts a message if any of these hold:

- it starts with `wip`, `fixup!` or `squash!` (case-insensitive);
- it matches `<type>(<scope>): <subject>` with a 10+ character subject, where
  type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `chore`, `security`, `ci`;
- its first line is at least 10 characters.

Merge, squash and fixup commits skip the check entirely (git passes a
`COMMIT_SOURCE` for those).

Repository convention is the conventional-commit form even though a bare
10-character line would pass:

```
feat(auth): add JWT token refresh endpoint
fix(validation): reject an empty fields object
security: pin the JWT issuer and audience claims
docs(readme): document the scope model
```

## Configuration

`lint-staged` lives in `package.json`:

```json
"lint-staged": {
  "src/**/*.js": ["eslint --fix", "eslint"],
  ".env": ["git rm --cached"],
  ".env.local": ["git rm --cached"],
  ".env.keys": ["git rm --cached"]
}
```

The three secret files are named individually rather than matched with `.env*`,
because that glob also matched `.env.example` — staging the one file that
documents the configuration silently untracked it.

ESLint config is `eslint.config.js` (flat config), with
`eslint-plugin-security` enabled.

## When a commit is rejected

**ESLint errors.** `npm run lint` shows everything; `npx eslint src --fix`
handles the mechanical ones. Restage and commit again. Note that `lint-staged`
stashes unstaged changes while it runs, so a partially-staged file is linted as
staged, not as it looks on disk.

**Lockfile out of sync.** `npm install`, then stage `package-lock.json`. For a
version-only bump, `npm install --package-lock-only` updates the lock's root
entry without touching `node_modules`.

**A `.env` file was staged.** Unstage it. If one was already committed in an
earlier commit, `git rm --cached` it, then rotate every secret it contained —
removing the file does not remove it from history.

## Bypassing

`git commit --no-verify` skips both hooks. Reserve it for a confirmed false
positive in check 2, and say so in the commit message. Never use it to get past
check 1: that check exists because the alternative is a leaked credential and a
rewrite of history.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `husky: command not found` | `npm install` |
| Hooks do not run at all | `npm run prepare`, then check `git config core.hooksPath` |
| Hook runs but ESLint finds no files | Expected when nothing under `src/` is staged |

## Reference

- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/lint-staged/lint-staged)
- [Conventional Commits](https://www.conventionalcommits.org/)
