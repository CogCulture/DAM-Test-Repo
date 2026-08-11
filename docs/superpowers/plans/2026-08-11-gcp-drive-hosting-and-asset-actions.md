# GCP Drive Hosting and Asset Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Asset actions reliably visible and prepare the DAM for a single-instance Google Compute Engine deployment using Google Drive for documents and persistent SQLite for application metadata.

**Architecture:** The UI replaces the fragile library popover with an owned, teleported fixed panel whose position is calculated by a pure utility. The server builds with Nitro `node-server` for GCP and selects a persistent better-sqlite3 Drizzle adapter when `DATABASE_PATH` is present, while retaining NuxtHub D1 for the existing development path. A Docker image and documented VM workflow mount `/var/lib/dam`, run migrations before startup, and keep document bytes in the existing Google Drive flows.

**Tech Stack:** Nuxt 3, Vue 3, Nitro node-server, TypeScript, Drizzle ORM, better-sqlite3, Node.js 22, Python 3, Docker, Google Compute Engine, Google Drive API.

## Global Constraints

- Do not deploy or mutate any Google Cloud resource.
- Do not delete or rewrite unrelated user changes in the dirty working tree.
- Run one production application instance while SQLite is the metadata database.
- Store production document bytes in Google Drive; SQLite stores metadata only.
- Preserve all existing governance and ingestion behavior and its 62-test baseline.
- Never commit `.env`, OAuth secrets, Super Admin credentials, local databases, uploaded documents, or generated build output.

---

### Task 1: Reliable Asset actions floating panel

**Files:**
- Create: `app/utils/floating-panel.ts`
- Create: `app/composables/useFloatingPanel.ts`
- Modify: `app/components/App/Files.vue`
- Test: `tests/floating-panel.test.mjs`

**Interfaces:**
- Consumes: a trigger `DOMRect`, panel size, viewport size, and margin/gap.
- Produces: `calculateFloatingPanelPosition(input): { top: number; left: number; maxHeight: number }` and `useFloatingPanel(triggerRef, panelRef, openRef)`.

- [ ] **Step 1: Write a failing positioning test**

```js
test('clamps the Asset actions panel inside the viewport', async () => {
  const { calculateFloatingPanelPosition } = await import('../app/utils/floating-panel.ts')
  assert.deepEqual(calculateFloatingPanelPosition({
    trigger: { top: 60, bottom: 100, left: 940, right: 1020 },
    panel: { width: 480, height: 600 },
    viewport: { width: 1024, height: 720 }, margin: 12, gap: 10,
  }), { top: 110, left: 532, maxHeight: 598 })
})
```

- [ ] **Step 2: Run the test and confirm import failure**

Run: `node --test tests/floating-panel.test.mjs`

- [ ] **Step 3: Implement the pure positioning utility and composable**

The composable will attach resize, capture-phase scroll, outside-pointer and Escape listeners only while open, update the teleported panel style, and restore trigger focus on close.

- [ ] **Step 4: Replace `UPopover` with trigger + `Teleport` panel**

Keep the existing panel contents and permissions. Add a click-away backdrop, fixed z-index, `aria-controls`, Escape dismissal, focus restoration and viewport-safe scrolling.

- [ ] **Step 5: Run the positioning and full feature tests**

Run: `node --test --test-isolation=none tests/*.test.mjs`

### Task 2: Persistent SQLite adapter for GCP

**Files:**
- Create: `server/utils/sqlite.ts`
- Create: `scripts/migrate-sqlite.mjs`
- Modify: `server/utils/drizzle.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/gcp-sqlite.test.mjs`

**Interfaces:**
- Consumes: `DATABASE_PATH` and `server/database/migrations/*.sql`.
- Produces: one process-wide `better-sqlite3` database, a Drizzle database with the existing schema, and an idempotent migration command.

- [ ] **Step 1: Write a failing temporary-database migration test**

The test creates a temporary directory, runs the migration script twice, and queries `sqlite_master` to prove required governance tables exist without duplicate-migration errors.

- [ ] **Step 2: Run the test and confirm the migration entry point is missing**

Run: `node --test tests/gcp-sqlite.test.mjs`

- [ ] **Step 3: Add `better-sqlite3` and implement idempotent ordered migrations**

Use a `_dam_migrations` ledger table and a transaction per unapplied SQL file. Resolve paths from explicit CLI/environment inputs rather than the current shell directory.

- [ ] **Step 4: Select the SQLite Drizzle adapter when `DATABASE_PATH` is set**

Keep the current D1 adapter when `DATABASE_PATH` is absent so local NuxtHub development is not broken.

- [ ] **Step 5: Run migration and feature tests**

Run: `node --test --test-isolation=none tests/*.test.mjs`

### Task 3: Node production runtime and health contract

**Files:**
- Modify: `nuxt.config.ts`
- Create: `server/api/health.get.ts`
- Modify: `package.json`
- Create: `tests/gcp-hosting.test.mjs`

**Interfaces:**
- Consumes: `NITRO_PRESET`, `NODE_ENV`, `PORT`, `HOST`, and `DATABASE_PATH`.
- Produces: `.output/server/index.mjs`, `GET /api/health`, `build:gcp`, `start:gcp`, and `verify:gcp` scripts.

- [ ] **Step 1: Write failing health and runtime contract tests**

Assert the health handler returns `{ status: 'ok' }` and exercise the built server over HTTP rather than checking source text.

- [ ] **Step 2: Run the tests and confirm missing runtime behavior**

Run: `node --test tests/gcp-hosting.test.mjs`

- [ ] **Step 3: Make the Nitro preset environment-selectable and production-safe**

Use `process.env.NITRO_PRESET || 'cloudflare_module'` and disable Nuxt DevTools in production.

- [ ] **Step 4: Add the health route and production scripts**

`build:gcp` builds `node-server`; `start:gcp` migrates then launches the server on the injected host/port.

- [ ] **Step 5: Build and smoke-test the production server**

Run the build, start it with a temporary SQLite path and test health, sign-in, DAM and Super Admin routes.

### Task 4: Container and Compute Engine deployment package

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.gcp.yml`
- Create: `.env.gcp.example`
- Create: `scripts/deploy-gce.ps1`
- Create: `docs/GCP_DEPLOYMENT.md`
- Modify: `.gitignore`
- Test: `tests/gcp-container-contract.test.mjs`

**Interfaces:**
- Consumes: source checkout and a user-created production `.env.gcp`.
- Produces: a non-root container listening on `8080`, a `/var/lib/dam` volume contract, health checking, and commands that prepare but do not execute GCP deployment automatically.

- [ ] **Step 1: Write failing container contract tests**

Run a Dockerfile/Compose parser test that verifies the build target, non-root user, port, health check, persistent volume, one replica, secret exclusion, and required environment names.

- [ ] **Step 2: Run the test and confirm deployment files are missing**

Run: `node --test tests/gcp-container-contract.test.mjs`

- [ ] **Step 3: Implement the Docker and Compose artifacts**

Use a multi-stage Node 22 Debian image, install Python requirements, expose 8080, mount `/var/lib/dam`, and invoke `pnpm run start:gcp`.

- [ ] **Step 4: Add the environment template and deployment guide**

Document Compute Engine creation, persistent disk, Docker installation, firewall, domain/HTTPS, OAuth redirect, Drive API enablement, backup, rollback and verification. Commands use placeholders and never contain secret values.

- [ ] **Step 5: Run contract tests and validate Docker configuration**

Run: `docker compose -f docker-compose.gcp.yml config` when Docker is available, followed by the full Node test suite.

### Task 5: Final verification

**Files:** No new production files.

- [ ] **Step 1: Run all tests and record exact pass/fail counts**

- [ ] **Step 2: Run a fresh GCP production build**

- [ ] **Step 3: Start the built server using a temporary persistent database and probe required routes**

- [ ] **Step 4: Browser-test Asset actions for visibility, controls, dismissal and console errors**

- [ ] **Step 5: Inspect the diff for secrets, generated data and unrelated changes**

- [ ] **Step 6: Report local verification and exact manual Google Cloud Console steps; do not deploy**
