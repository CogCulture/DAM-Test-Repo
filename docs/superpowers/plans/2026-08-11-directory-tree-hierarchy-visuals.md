# Directory Tree Hierarchy Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make expanded sidebar branches clearly distinguishable from root-level items.

**Architecture:** Keep the existing recursive `AppDirectoryNode` behavior intact and change only its presentation. Increase the per-level spacing and wrap expanded descendants in a token-based branch container with a connector line and subtle background.

**Tech Stack:** Nuxt 3, Vue 3 templates, Tailwind CSS utility classes, existing DAM CSS variables.

## Global Constraints

- Modify only `app/components/App/DirectoryNode.vue` for the visual behavior.
- Preserve navigation, preview, context-menu, upload-destination, expansion, loading, pagination, and refresh behavior.
- Use existing theme variables and icons; add no dependencies or image assets.
- Communicate hierarchy through indentation and structure, not color alone.

---

### Task 1: Strengthen recursive branch presentation

**Files:**
- Modify: `app/components/App/DirectoryNode.vue`

**Interfaces:**
- Consumes: existing `level: number`, `open`, `isFolder`, `files`, `loading`, and `hasNextPage` state.
- Produces: unchanged component API with clearer recursive hierarchy presentation.

- [ ] **Step 1: Record the current rendered hierarchy**

Open an expanded folder in the running application and confirm child rows currently use a 12px level increment without a branch guide.

- [ ] **Step 2: Implement the approved hierarchy spacing**

Change row indentation to a 20px level increment:

```vue
:style="{ paddingLeft: `${(level * 20) + 6}px` }"
```

Wrap the expanded branch in a positioned container using existing theme tokens:

```vue
<div
  v-if="open && isFolder"
  class="relative ml-3 border-l border-[var(--dam-line)] bg-[color-mix(in_srgb,var(--dam-panel-raised)_35%,transparent)] py-0.5"
>
  <!-- recursive children and branch states -->
</div>
```

Align loading, load-more, and empty states with the same 20px child increment.

- [ ] **Step 3: Run scoped source validation**

Run:

```powershell
git diff --check -- app/components/App/DirectoryNode.vue
```

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 4: Run regression and compilation validation**

Run:

```powershell
npm.cmd run verify:gcp
pnpm.cmd run build
```

Expected: all automated tests pass and the Nuxt production build exits 0.

- [ ] **Step 5: Inspect the rendered result**

Reload `/org`, expand a folder, and confirm:

- Root-level rows retain their current alignment.
- Child rows have visibly stronger indentation.
- A subtle vertical guide and grouped background connect children to their parent.
- Nested folders repeat the same visual treatment.
- Labels remain truncated within the sidebar and no framework overlay or relevant console error appears.

- [ ] **Step 6: Commit the isolated styling change**

```powershell
git add -- app/components/App/DirectoryNode.vue
git commit -m "style: clarify directory tree hierarchy"
```
