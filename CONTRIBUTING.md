# Contributing to OpenBanner

First off — thanks for taking the time to contribute! 🎉

OpenBanner is self-hosted, MIT-licensed software. Contributions of all sizes are welcome:
bug reports, fixes, features, docs, templates, and performance work.

> By contributing, you agree that your contributions will be licensed under the
> [MIT License](./LICENSE) that covers the project.

---

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Before you start](#before-you-start)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [How to propose a change](#how-to-propose-a-change)
- [Coding conventions](#coding-conventions)
- [Commit messages](#commit-messages)
- [Reporting bugs & security issues](#reporting-bugs--security-issues)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).
Please be kind and inclusive. Report unacceptable behaviour to
**kuseh@smartinnovationsgh.com** (or via GitHub's private security/discussion channels).

## Before you start

- **Check existing issues** before opening a new one — someone may already be on it.
- For non-trivial features, **open an issue first** to discuss scope and approach before
  writing a lot of code. A 30-second heads-up can save a 3-hour PR.
- Keep PRs **focused** — one logical change per PR is easier and faster to review.

## Development setup

You need **Docker + Docker Compose v2** for the standard local stack (recommended), or
**Node.js 22+** if you want to run the API outside Docker. See
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for the full guide (running the API bare,
debugging headless Chromium, running tests, etc.).

Quick version:

```bash
git clone https://github.com/AkideweKuseh/openbanner.git
cd openbanner
cp .env.example .env              # dev defaults work as-is for localhost
docker compose -f docker-compose.dev.yml up -d --build
# open http://localhost:8080
```

In the app: sign in (mock auth — any email + 4+ char password), open **API Settings** (gear),
set the API URL to `http://localhost:8080` and the API key to `API_SECRET_TOKEN` from `.env`.

## Project layout

```
api/     Express render API + Puppeteer/Chromium + MinIO client (Node ESM)
ui/      Designer canvas + dashboard (vanilla JS, no build step)
nginx/   Reverse proxy config (dev + prod template)
docs/    Architecture and development deep-dives
```

See the [README](./README.md#project-structure) for the per-file breakdown and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for how requests flow end-to-end.

## How to propose a change

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/<short-description>
   ```
2. Make your change. Add or update tests where it makes sense (`api/` uses Node's built-in
   test runner — `npm test` from `api/`).
3. Make sure the local dev stack still boots and your change behaves as expected.
4. **Do not commit secrets, `.env`, or generated files** (`nginx/nginx.generated.conf`,
   `certs/*.pem`, `node_modules/`). These are git-ignored — keep them that way.
5. Push and open a **Pull Request** against `main`. Fill in the PR template.

Branch naming — pick whichever matches the change:

| Prefix | Use for |
|--------|---------|
| `feat/`  | New functionality |
| `fix/`   | Bug fixes |
| `docs/`  | Documentation only |
| `refactor/` | Code restructuring, no behaviour change |
| `chore/` | Tooling, deps, CI |
| `ops/`   | Deployment / infra |

## Coding conventions

- **API (`api/`):** plain ES modules, no TypeScript/build step. Keep modules small and
  focused (one concern per file). Validate all external input with **Zod** schemas
  (`api/src/schema.js`). Log with **pino** — never `console.log` in app code.
- **UI (`ui/`):** vanilla ES modules, no framework, no bundler. CSS in `ui/css/`, one file
  per surface. Don't introduce a build step without discussing it first.
- **Security defaults to "off":** new features that fetch remote resources, open network
  access, or change auth must default to the most locked-down behaviour and be gated behind
  an explicit opt-in env var. See [`SECURITY.md`](./SECURITY.md).
- Match the surrounding style — naming, comment density, formatting. Consistency beats
  personal preference.

## Commit messages

OpenBanner uses a light **Conventional Commits** style (the history already follows it):

```
<type>(<scope>): <imperative summary in lowercase>

<optional body explaining why, not what>
```

Examples from this repo's own log:

```
feat(designer): layer drag, text-box sizing, typography, and UX fixes
fix(render): clamp remote image bytes before buffering
deploy: harden secret handling in deploy.sh
```

- Keep the subject line **≤ 72 chars**, imperative mood ("add", not "added").
- Reference the issue number in the body or PR if relevant (`Closes #42`).
- Squash or rebase messy commits before requesting review — a clean history is appreciated.

## Reporting bugs & security issues

- **Bugs & feature requests:** open a [GitHub issue](https://github.com/AkideweKuseh/openbanner/issues)
  using one of the templates.
- **Security vulnerabilities:** **do not** open a public issue. See [`SECURITY.md`](./SECURITY.md)
  and report privately via GitHub Security Advisories
  ([Report a vulnerability](https://github.com/AkideweKuseh/openbanner/security/advisories/new)).

---

Happy hacking! 💛
