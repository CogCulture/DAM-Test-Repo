# GCE Small-VM Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GCP Docker profile safe for the current 3.8 GiB VM while retaining a one-variable upgrade path for larger machines.

**Architecture:** Compose reads `DAM_MEMORY_LIMIT`, defaults it to `3g`, and applies the same value to both service-level and deploy memory limits. The production environment example and deployment runbook define the current host constraint and the resize procedure without changing application behavior or persistent storage paths.

**Tech Stack:** Docker Compose, dotenv, Node.js built-in test runner, Nuxt production container

## Global Constraints

- Preserve one application replica, SQLite, `/var/lib/dam`, Google identity login, and every existing DAM feature.
- Default `DAM_MEMORY_LIMIT` to `3g` for the current 3.8 GiB VM.
- Apply the identical memory expression to `mem_limit` and `deploy.resources.limits.memory`.
- Increase VM RAM before raising memory-intensive RAG concurrency.

---

### Task 1: Configurable GCP container memory

**Files:**
- Modify: `tests/gcp-container-contract.test.mjs`
- Modify: `docker-compose.gcp.yml`
- Modify: `.env.gcp.example`
- Modify: `docs/GCP_DEPLOYMENT.md`

**Interfaces:**
- Consumes: Compose interpolation variable `DAM_MEMORY_LIMIT` from the shell or `.env.gcp`.
- Produces: `${DAM_MEMORY_LIMIT:-3g}` as the single expression used by both Compose memory-limit declarations.

- [ ] **Step 1: Write the failing contract test**

Replace the fixed `6g` assertion and extend the environment assertion:

```js
assert.equal((compose.match(/\$\{DAM_MEMORY_LIMIT:-3g\}/g) || []).length, 2);
assert.doesNotMatch(compose, /mem_limit:\s*6g/);
assert.match(environment, /^DAM_MEMORY_LIMIT=3g$/m);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/gcp-container-contract.test.mjs
```

Expected: FAIL because Compose still contains fixed `6g` values and `.env.gcp.example` has no `DAM_MEMORY_LIMIT`.

- [ ] **Step 3: Implement the minimal Compose and environment changes**

Set both Compose declarations to the same interpolation:

```yaml
mem_limit: ${DAM_MEMORY_LIMIT:-3g}
```

```yaml
memory: ${DAM_MEMORY_LIMIT:-3g}
```

Add to `.env.gcp.example`:

```dotenv
DAM_MEMORY_LIMIT=3g
```

- [ ] **Step 4: Update the production runbook**

Document that the current 4 GiB VM uses a 3 GiB container limit, large concurrent RAG jobs require more RAM, and scaling consists of resizing the VM, changing `DAM_MEMORY_LIMIT`, and recreating the container. Clarify that `/var/lib/dam` may reside on the retained boot Persistent Disk when company policy forbids an additional disk, with reduced capacity/isolation and mandatory snapshots.

- [ ] **Step 5: Verify GREEN and rendered Compose configuration**

Run:

```powershell
node --test --test-isolation=none tests/gcp-container-contract.test.mjs
docker compose --env-file .env.gcp.example -f docker-compose.gcp.yml config
```

Expected: tests PASS; rendered service and deploy memory limits both equal 3 GiB.

- [ ] **Step 6: Run the complete regression suite**

Run:

```powershell
node --test --test-isolation=none tests/*.test.mjs
git diff --check
```

Expected: all tests PASS and diff check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add tests/gcp-container-contract.test.mjs docker-compose.gcp.yml .env.gcp.example docs/GCP_DEPLOYMENT.md
git commit -m "build: support 3 GB GCE memory profile"
```

### Task 2: Deployment handoff

**Files:**
- Verify: `docs/GCP_DEPLOYMENT.md`
- Verify: repository branch and remote configuration

**Interfaces:**
- Consumes: completed `codex/gce-persistent-storage` branch and `origin` Git remote.
- Produces: an accessible GitHub branch or merged deployment branch that the VM can clone, plus exact SSH deployment commands.

- [ ] **Step 1: Verify branch readiness**

```powershell
git status --short
git log -1 --oneline
```

Expected: clean worktree on `codex/gce-persistent-storage`.

- [ ] **Step 2: Present integration options**

Offer local merge, push plus pull request, or preserving the branch. Do not merge or push without the user's selected integration action.

- [ ] **Step 3: Prepare the VM command sequence**

Provide commands for installing Docker from its official Ubuntu repository, cloning the selected GitHub branch, creating `.env.gcp`, building with `docker-compose.gcp.yml`, checking `/api/health`, and inspecting disk/container memory. Never request or expose OAuth secrets in chat.
