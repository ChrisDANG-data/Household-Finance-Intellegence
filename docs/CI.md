# Continuous Integration (GitHub Actions)

Automated gates run on every **pull request** and **push to `main`**.

## Workflow

File: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

| Step | Command | Purpose |
|------|---------|---------|
| Install | `npm ci` | Reproducible deps from `package-lock.json` |
| Test | `npm test` | Vitest unit tests in `apps/web` |
| Build | `npm run build` | Prisma generate + Next.js production build |

**CD (deploy)** is unchanged: Vercel still deploys when you merge to `main`.

## Enable as a merge gate

1. GitHub repo → **Settings** → **Branches**
2. **Branch protection rule** for `main`
3. Enable **Require status checks to pass before merging**
4. Select check: **Test & build** (from workflow `CI`)

Optional: **Require branches to be up to date before merging**

## Run locally (same as CI)

```powershell
cd "c:\DLH\2026 Inference AI Course\Final_Project_AI"
$env:DATABASE_URL="postgresql://ci:ci@localhost:5432/ci?schema=public"
npm ci
npm test
npm run build
```

## Not in CI yet

- **ESLint** — existing lint errors in UI components; fix separately before adding `npm run lint` to CI
- **E2E** — no Playwright/Cypress suite yet
- **Postgres integration tests** — unit tests mock `loadState`; no live Neon in CI

## Jira

Epic **HFI-E7** — mark CI story Done after first green run on a PR.
