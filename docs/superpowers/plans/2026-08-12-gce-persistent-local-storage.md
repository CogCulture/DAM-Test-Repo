# GCE Persistent Local Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the DAM as one production Docker container on GCE with SQLite and local asset bytes persisted on a host-mounted GCE Persistent Disk, while preserving metadata and optional Google Drive behavior.

**Architecture:** The container uses the node-server Nitro preset and maps the host's `/var/lib/dam` to the same container path. A startup persistence check prepares and verifies the database/files paths before idempotent migrations run. Organization storage remains selected by the existing `orgType` discriminator, and an explicit cutover utility changes only that field after creating a database backup.

**Tech Stack:** Nuxt 3, Node.js 22, TypeScript, SQLite/better-sqlite3, Docker, Docker Compose, Google Compute Engine Persistent Disk.

## Global Constraints

- Preserve all existing features and retain optional Google Drive routes and storage behavior.
- Do not migrate existing Google Drive file bytes; the local asset library starts empty.
- Preserve the existing SQLite database and all organizations, departments, folder metadata, permissions, nomenclature, taxonomies, and settings.
- Keep exactly one application replica while using SQLite and a directly mounted disk.
- Store production state only beneath `/var/lib/dam`: database at `/var/lib/dam/database.sqlite`, asset bytes beneath `/var/lib/dam/files`.
- Use identity-only Google OAuth by default; request Drive scope only through the explicit optional Drive connection flow.
- Do not commit secrets, `.env.gcp`, database files, uploads, backups, or OAuth tokens.
- Write every behavior test first and observe the expected failure before implementing production code.

---

### Task 1: Persistence startup guard

**Files:**
- Create: `scripts/prepare-persistent-storage.mjs`
- Modify: `scripts/validate-gcp-env.mjs`
- Modify: `package.json`
- Test: `tests/gcp-hosting.test.mjs`

**Interfaces:**
- Consumes: `DATABASE_PATH`, `LOCAL_DAM_STORAGE_DIR`, and an optional injected filesystem operations object for tests.
- Produces: `validatePersistentStoragePaths({ databasePath, storageDirectory }): string[]` and `preparePersistentStorage({ databasePath, storageDirectory }): Promise<{ databasePath: string; storageDirectory: string }>`.

- [ ] **Step 1: Write failing validation tests**

Add tests demonstrating that `LOCAL_DAM_STORAGE_DIR` is required, relative production paths are rejected, database and file paths cannot be equal, and `/var/lib/dam/database.sqlite` plus `/var/lib/dam/files` is valid.

```js
test('production persistence requires absolute separate database and asset paths', async () => {
  const { validatePersistentStoragePaths } = await import('../scripts/prepare-persistent-storage.mjs');
  assert.deepEqual(validatePersistentStoragePaths({ databasePath: 'db.sqlite', storageDirectory: 'files' }), [
    'DATABASE_PATH must be absolute.',
    'LOCAL_DAM_STORAGE_DIR must be absolute.',
  ]);
  assert.deepEqual(validatePersistentStoragePaths({
    databasePath: '/var/lib/dam/database.sqlite',
    storageDirectory: '/var/lib/dam/files',
  }), []);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-isolation=none tests/gcp-hosting.test.mjs`

Expected: FAIL because `prepare-persistent-storage.mjs` does not exist and `LOCAL_DAM_STORAGE_DIR` is not required.

- [ ] **Step 3: Implement storage validation and writable-path preparation**

Implement path validation with `node:path.isAbsolute/resolve/relative`. `preparePersistentStorage` must create the database parent and asset directory, write and remove a uniquely named probe in the asset directory, and never truncate or replace an existing database.

- [ ] **Step 4: Put the guard before migrations in startup**

Change `start:gcp` to:

```json
"start:gcp": "node scripts/validate-gcp-env.mjs && node scripts/prepare-persistent-storage.mjs && node scripts/migrate-sqlite.mjs && node .output/server/index.mjs"
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none tests/gcp-hosting.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```bash
git add scripts/prepare-persistent-storage.mjs scripts/validate-gcp-env.mjs package.json tests/gcp-hosting.test.mjs
git commit -m "feat: validate persistent DAM storage at startup"
```

### Task 2: Safe organization storage cutover

**Files:**
- Create: `scripts/set-organization-storage.mjs`
- Modify: `package.json`
- Test: `tests/gcp-storage-cutover.test.mjs`

**Interfaces:**
- Consumes: `{ databasePath: string, organizationId: string, target: 'local' | 'gdrive', backupDirectory?: string }`.
- Produces: `setOrganizationStorage(input): Promise<{ organizationId: string; previousType: string; nextType: string; backupPath: string }>` and CLI arguments `--organization`, `--target`, `--database`, `--backup-directory`.

- [ ] **Step 1: Write a failing preservation test**

Create a temporary SQLite database with `organizations`, `org_departments`, and `files` fixtures. Assert that switching `org-drive` to `local` changes only `organizations.org_type` from `gdrive` to `s3`, retains every department/file row, and creates a non-empty database backup before the update.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none tests/gcp-storage-cutover.test.mjs`

Expected: FAIL because the cutover module does not exist.

- [ ] **Step 3: Implement backup-first transactional cutover**

Use `better-sqlite3` backup support before opening the update transaction. Reject unknown organizations and target values. Map `local` to the existing compatible database value `s3`; do not delete or rewrite Drive connections, departments, files, permissions, or settings.

- [ ] **Step 4: Add an explicit package command**

Add:

```json
"storage:set": "node scripts/set-organization-storage.mjs"
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none tests/gcp-storage-cutover.test.mjs`

Expected: PASS with preserved fixture counts and a verified backup.

- [ ] **Step 6: Commit the task**

```bash
git add scripts/set-organization-storage.mjs package.json tests/gcp-storage-cutover.test.mjs
git commit -m "feat: add safe organization storage cutover"
```

### Task 3: Production Docker persistence contract

**Files:**
- Modify: `docker-compose.gcp.yml`
- Modify: `Dockerfile`
- Modify: `.env.gcp.example`
- Modify: `.dockerignore`
- Test: `tests/gcp-container-contract.test.mjs`

**Interfaces:**
- Consumes: host `/var/lib/dam`, `.env.gcp`, container port 8080.
- Produces: one container with `/var/lib/dam:/var/lib/dam`, a health check, graceful init, bounded memory, and no persistent data embedded in the image.

- [ ] **Step 1: Write failing container contract tests**

Parse Compose with simple line-oriented assertions and verify literal contracts: bind mount `/var/lib/dam:/var/lib/dam`, `replicas: 1`, `init: true`, `stop_grace_period: 30s`, `mem_limit: 6g`, loopback port binding `127.0.0.1:8080:8080`, and no named `dam_data` volume. Verify `.env.gcp.example` declares `LOCAL_DAM_STORAGE_DIR=/var/lib/dam/files`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none tests/gcp-container-contract.test.mjs`

Expected: FAIL because Compose currently uses a named volume and publishes port 8080 on every interface.

- [ ] **Step 3: Implement the Compose and image hardening**

Replace the named volume with the host bind mount, bind the direct port to loopback, add init/grace/resource settings, keep the non-root runtime and health check, and add a read-only root filesystem only if all required runtime writes remain confined to `/var/lib/dam` and temporary mounts. Add `tmpfs` for `/tmp` if read-only mode is enabled.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none tests/gcp-container-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Render and validate Compose**

Run: `docker compose --env-file .env.gcp.example -f docker-compose.gcp.yml config`

Expected: valid rendered configuration. If Docker is unavailable, record this as an environment limitation and retain the automated contract test.

- [ ] **Step 6: Commit the task**

```bash
git add docker-compose.gcp.yml Dockerfile .env.gcp.example .dockerignore tests/gcp-container-contract.test.mjs
git commit -m "build: persist DAM data on the GCE host disk"
```

### Task 4: Identity-first production experience with optional Drive preserved

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `app/components/auth/Card.vue`
- Modify: `.env.example`
- Modify: `.env.gcp.example`
- Test: `tests/google-auth-storage-mode.test.mjs`

**Interfaces:**
- Consumes: `NUXT_PUBLIC_ENABLE_GDRIVE_STORAGE` with default `false`.
- Produces: public runtime config `enableGDriveStorage: boolean`; normal Google provider login remains visible; the explicit "Host Google Drive Folder" action renders only when the flag is true.

- [ ] **Step 1: Write a failing UI/config contract test**

Test the extracted pure flag parser or runtime configuration helper with literal inputs (`true`, `false`, missing), and render/source-contract the component condition so the Drive-hosting action is absent by default but available when explicitly enabled.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none tests/google-auth-storage-mode.test.mjs`

Expected: FAIL because no storage feature flag exists and the Drive-hosting action is unconditional.

- [ ] **Step 3: Implement the feature flag**

Expose the boolean through `runtimeConfig.public`, read it with `useRuntimeConfig()` in `Card.vue`, and wrap only the explicit Drive-hosting divider/button. Do not modify or delete `/api/auth/google?gdrive=true`, Drive scopes in that explicit flow, Drive APIs, or Drive organization routing.

- [ ] **Step 4: Run focused and compatibility tests**

Run: `node --test --test-isolation=none tests/google-auth-storage-mode.test.mjs tests/drive-storage-routing.test.mjs tests/google-oauth-refresh.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add nuxt.config.ts app/components/auth/Card.vue .env.example .env.gcp.example tests/google-auth-storage-mode.test.mjs
git commit -m "feat: default production login to local storage"
```

### Task 5: GCE disk deployment, backup, and restore operations

**Files:**
- Modify: `scripts/deploy-gce.ps1`
- Create: `scripts/backup-local-storage.sh`
- Create: `scripts/restore-local-storage.sh`
- Modify: `docs/GCP_DEPLOYMENT.md`
- Test: `tests/gcp-operations.test.mjs`

**Interfaces:**
- Consumes: GCP project, zone, VM name, persistent disk size/name, `/var/lib/dam`, Compose service `dam`.
- Produces: infrastructure command preview that creates/attaches a balanced Persistent Disk; deterministic mount/setup instructions; backup archive containing `database.sqlite` and `files`; restore flow that requires a stopped application and never overwrites without an explicit confirmation argument.

- [ ] **Step 1: Write failing operations tests**

Assert the deploy preview includes `gcloud compute disks create`, VM disk attachment, no Drive API enablement requirement, and no public TCP 8080 firewall rule. Exercise backup/restore scripts against a temporary fixture directory where the backup is stored outside the data root; verify both SQLite bytes and nested asset bytes round-trip.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none tests/gcp-operations.test.mjs`

Expected: FAIL because persistent-disk and full data-root operations do not exist.

- [ ] **Step 3: Implement infrastructure preview and safe operations**

Extend PowerShell parameters with disk name and size, create and attach a `pd-balanced` disk, and print the Debian formatting/mount-by-UUID steps without formatting automatically on an existing disk. Backup scripts must fail if the destination is within `/var/lib/dam`; restore must require the service to be stopped and an explicit confirmation flag.

- [ ] **Step 4: Rewrite deployment documentation for local persistent storage**

Document disk creation, mounting, ownership, Docker startup, company OAuth identity-only configuration, explicit organization cutover command, snapshots, backup/restore, container-recreation persistence verification, upgrade, rollback, and the one-replica limit.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none tests/gcp-operations.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```bash
git add scripts/deploy-gce.ps1 scripts/backup-local-storage.sh scripts/restore-local-storage.sh docs/GCP_DEPLOYMENT.md tests/gcp-operations.test.mjs
git commit -m "docs: add GCE disk backup and recovery operations"
```

### Task 6: Full verification

**Files:**
- Verify only; modify files only to address failures caused by Tasks 1–5.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: evidence that existing behavior and the production deployment contract remain intact.

- [ ] **Step 1: Run all automated tests**

Run: `node --test --test-isolation=none tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run formatting/diff validation**

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 3: Build the node-server application**

Run: `pnpm run build:gcp`

Expected: exit 0. Distinguish sandbox/network/toolchain failures from application compiler failures.

- [ ] **Step 4: Build the Docker image**

Run: `docker compose -f docker-compose.gcp.yml build`

Expected: exit 0.

- [ ] **Step 5: Smoke-test persistence when Docker is available**

Start with a temporary host data directory, check `/api/health`, create a marker beneath the mounted files directory, recreate the container, and verify the marker remains. Do not use or overwrite `/var/lib/dam` on the development workstation.

- [ ] **Step 6: Review the final diff and report limitations**

Confirm unrelated working-tree files were not overwritten or staged. Report exact test counts, build results, Docker availability, and the manual GCP actions still requiring project credentials.
