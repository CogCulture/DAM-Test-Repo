# DAM Platform — Complete Codebase & Security Audit Report

**Date:** 2026-10-06  
**Auditor:** Antigravity AI  
**Repository:** `DAM-Tanish / digital-asset-management`  

---

## 1. Executive Summary

A comprehensive architectural, security, and functional code review was performed on the Digital Asset Management (DAM) platform. This audit evaluated multi-tenant access boundaries, OAuth & session authentication, the RAG vector ingestion pipeline, cloud/local storage adapters, and user interface workflows.

### Summary of Findings by Severity

| Severity | Count | Primary Impact Areas |
| :--- | :---: | :--- |
| **Critical** | **3** | Account takeover via invite tokens, cross-organization admin bypass, invalid AI model identifier breaking RAG |
| **High** | **4** | Fake cloud storage connectors bricking uploads, missing Linux PPTX visual extraction, audio ingestion stub, missing superadmin rate limiting |
| **Medium** | **4** | Hardcoded production Pinecone API key in scripts, unhandled Cloudflare `hubBlob()` call on Node.js/GCP, localhost OAuth redirect in `.env`, missing public share link UI |
| **Low / Polish** | **3** | Stubbed dummy admin redirect pages (`dlq.vue`, `access-control.vue`), ignored folder-to-website domain input |

---

## 2. Security Vulnerabilities & Risks

### [CRITICAL] 2.1 Invitation Hijacking & Privilege Escalation
* **Location:** [`server/api/auth/invite/[token].post.ts:L13-L46`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/api/auth/invite/%5Btoken%5D.post.ts#L13-L46)
* **Mechanics:** When accepting an invitation token via `POST /api/auth/invite/:token`, the server validates token existence, status (`pending`), and expiration. However, **it never verifies that the authenticated user's email matches the invited email (`invite.email`)**:
  ```typescript
  // Missing check in server/api/auth/invite/[token].post.ts:
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw createError({ 
      status: 403, 
      message: "This invitation was sent to a different email address." 
    });
  }
  ```
* **Impact:** If an invitation link intended for an executive or department head (`admin` / `dept_head` role) is intercepted, forwarded, or leaked, **any logged-in user who clicks the link claims it**, immediately elevating their account into that organization with full administrative permissions.

---

### [CRITICAL] 2.2 Cross-Organization / Multi-Tenant Authorization Bypass
* **Location:** [`server/utils/db.ts:L451-L470`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/db.ts#L451-L470) (`getItemById`, `ensureFile`) and [`server/utils/permission.ts:L94-L102`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/permission.ts#L94-L102) (`requireDepartmentAccess`)
* **Mechanics:** 
  1. `ensureFile(bucketName, id)` (called in `rename.post.ts`, `move.post.ts`, `copy.post.ts`, `favorite.post.ts`) calls `getItemById(id)` **without passing `orgId`**, bypassing tenant scoping in database queries.
  2. In `permission.ts`, `requireDepartmentAccess` has an admin shortcut:
     ```typescript
     if (user.role === "admin" || user.role === "superadmin") return;
     ```
     It checks whether the user is an `admin`, but **fails to verify that `user.organizationId === file.organizationId`**.
* **Impact:** An admin of Organization A can pass the `fileId` of a file belonging to Organization B to endpoints like `/api/files/[bucket]/rename`, `/move`, or `/copy` and modify or access cross-tenant data.

---

### [HIGH] 2.3 Unrestricted SuperAdmin Brute-Force Attack Surface
* **Location:** [`server/api/superadmin/login.post.ts:L1-L22`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/api/superadmin/login.post.ts#L1-L22)
* **Mechanics:** The superadmin login endpoint checks credentials directly against environment variables:
  ```typescript
  if (email !== envEmail || password !== envPassword) {
    throw createError({ status: 401, message: "Invalid Super Admin credentials." });
  }
  ```
  There is no rate limiting, IP tracking, captcha, or exponential delay mechanism. Furthermore, `email !== envEmail` uses non-constant-time string comparison, leaving it open to timing analysis.
* **Impact:** An attacker can launch automated dictionary attacks against `/api/superadmin/login` without being throttled or locked out.

---

### [MEDIUM] 2.4 Production API Key Committed in Scripts
* **Location:** [`scripts/inspect-pinecone.mjs:L1`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/scripts/inspect-pinecone.mjs#L1)
* **Mechanics:** The active Pinecone API key (`pcsk_5pbuA5_...`) is hardcoded directly into the script file rather than loaded via `process.env.PINECONE_API_KEY`.
* **Impact:** If the repository is cloned, pushed to public mirrors, or shared with external collaborators, the entire vector database index is exposed to unauthorized reads and deletions.

---

### [MEDIUM] 2.5 Production Google OAuth Misconfiguration
* **Location:** [`.env:L9`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/.env#L9)
* **Mechanics:** `NUXT_OAUTH_GOOGLE_REDIRECT_URL=http://localhost:3000/api/auth/google`.
* **Impact:** When deployed to GCP/production domains, all Google OAuth logins will fail or redirect back to the user's local machine instead of the production site.

---

## 3. Functionality Issues & Pipeline Bugs

### [CRITICAL] 3.1 Invalid Default Claude Model Identifier Breaks RAG Pipeline
* **Location:** [`server/utils/rag_parsers/processor.py:L18`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/processor.py#L18), [`llm_client.py:L49`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/llm_client.py#L49), and parser scripts (`parse_docx.py`, `parse_excel.py`, `parse_pdf_anthropic.py`, `parse_video_anthropic.py`, `parse_pptx_v3.py`).
* **Bug:** The default model string is hardcoded across all Python parsers as:
  ```python
  CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
  ```
  `claude-sonnet-4-6` **does not exist** in Anthropic's API (Anthropic models are `claude-3-5-sonnet-20241022`, `claude-3-7-sonnet-20250219`, `claude-3-5-haiku-20241022`).
* **Impact:** Any invocation relying on this default will fail with an Anthropic `NotFoundError: model not found: claude-sonnet-4-6`. Because `OPENAI_API_KEY` is also absent from `.env`, fallback fails as well.

---

### [HIGH] 3.2 PowerPoint Slide Visual Extraction Fails on Linux/Docker (GCP)
* **Location:** [`server/utils/rag_parsers/parse_pptx_v3.py:L103-L125`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/parse_pptx_v3.py#L103-L125)
* **Bug:** To extract slide images and charts for vision AI, `parse_pptx_v3.py` requires Windows COM:
  ```python
  if not WIN32_AVAILABLE:
      raise Exception("win32com.client is not available.")
  powerpoint = win32com.client.Dispatch("PowerPoint.Application")
  ```
* **Impact:** Inside the Linux Docker container on GCP, `WIN32_AVAILABLE` is always `False`. Visual slide extraction catches the error and skips it. As a result, **PPT charts, graphic designs, and infographic slides are never processed by AI on production**. Only plain text shapes extracted by `python-pptx` are read.

---

### [HIGH] 3.3 Audio Ingestion is a Non-Functional Stub
* **Location:** [`server/utils/rag_parsers/parse_audio.py:L36-L47`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/parse_audio.py#L36-L47)
* **Bug:** 
  1. `SpeechRecognition` is imported conditionally but is **missing from `requirements.txt`**, so speech recognition is never active.
  2. Speech recognition is only attempted if `ext == ".wav"`. For `.mp3` and `.m4a` files (both explicitly listed in `SUPPORTED_EXTENSIONS`), no audio extraction or transcription is attempted at all.
* **Impact:** Uploading an audio file to RAG produces an empty markdown file with only the file name and file size. No speech-to-text or semantic vector data is generated.

---

### [HIGH] 3.4 Unhandled Cloudflare `hubBlob()` in GCP Docker Node Runtime
* **Location:** [`server/api/files/[bucket]/rag-batch.post.ts:L378`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/api/files/%5Bbucket%5D/rag-batch.post.ts#L378)
* **Bug:** 
  ```typescript
  const hBlob = await hubBlob().get(file.storagePath || file.path);
  ```
  `hubBlob()` is a Cloudflare Workers global helper. On GCP / Node.js, this throws `ReferenceError: hubBlob is not defined`. Because line 385 catches all errors and continues:
  ```typescript
  catch (e) {
    sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: "Could not fetch file binary" });
    continue;
  }
  ```
* **Impact:** Any batch RAG run where `storageTarget !== "local"` fails on GCP with `"Could not fetch file binary"`.

---

## 4. Non-Working Features & Broken/Stubbed UI Buttons

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NON-WORKING UI BUTTONS & STUBS                        │
├──────────────────────────┬────────────────────────────────┬─────────────────┤
│ Feature / Button         │ Location                       │ Status          │
├──────────────────────────┼────────────────────────────────┼─────────────────┤
│ "Connect OneDrive"       │ app/pages/auth/select-storage  │ FAKE (Timeout)  │
│ "Connect SharePoint"     │ app/pages/auth/select-storage  │ FAKE (Timeout)  │
│ "Connect Box"            │ app/pages/auth/select-storage  │ FAKE (Toggle)   │
│ "Connect Dropbox"        │ app/pages/auth/select-storage  │ FAKE (Toggle)   │
│ "Publish as Website"     │ app/components/Publish.vue     │ DEAD (Ignored)  │
│ "Copy Public Link"       │ app/components/Publish.vue     │ MISSING         │
│ Dead Letter Queue Page   │ app/pages/admin/dlq.vue        │ DUMMY REDIRECT  │
│ Access Control Page      │ app/pages/admin/access-control │ DUMMY REDIRECT  │
│ Folder Requests Page     │ app/pages/admin/folder-requests│ DUMMY REDIRECT  │
└──────────────────────────┴────────────────────────────────┴─────────────────┘
```

### 4.1 Fake Cloud Storage Connectors (`select-storage.vue`)
* **Location:** [`app/pages/auth/select-storage.vue:L132-L155`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/pages/auth/select-storage.vue#L132-L155)
* **What Happens:** The UI displays connection cards for Microsoft OneDrive, Microsoft SharePoint, Box, and Dropbox. When the user clicks the buttons:
  - **"Connect OneDrive"**: Executes `setTimeout(..., 1200)` and sets a local boolean `onedriveConnected = true`.
  - **"Connect SharePoint"**: Executes `setTimeout(..., 1200)` and sets `sharepointConnected = true`.
  - **"Connect Box"**: Simply toggles `boxConnected.value = !boxConnected.value`.
  - **"Connect Dropbox"**: Simply toggles `dropboxConnected.value = !dropboxConnected.value`.
* **Resulting Bug:** When the user clicks **"Save Storage Option"**, the backend saves `orgType = "onedrive"` into PostgreSQL. Because **no backend client or storage adapter exists for OneDrive/SharePoint/Box/Dropbox**, all subsequent uploads and downloads fail for that organization.

---

### 4.2 "Publish Folder as Website" Domain Input is Ignored
* **Location:** [`app/components/Publish.vue:L58-L62`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/components/Publish.vue#L58-L62) & [`server/api/files/[bucket]/publish.post.ts:L10`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/api/files/%5Bbucket%5D/publish.post.ts#L10)
* **What Happens:** When publishing a folder, the modal displays:
  > *"If you want to publish this folder as a website, specify a domain."*
  The user enters a custom domain and clicks **"Publish"**.
* **Resulting Bug:** `publish.post.ts` only reads `{ id, visibility, name, type }` from the request body. The `domain` string is never parsed, never stored in the database, and there is no DNS or virtual host routing logic. The input is completely discarded.

---

### 4.3 Missing Public Link in "Publish" Workflow
* **Location:** [`app/components/Publish.vue`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/components/Publish.vue) and [`app/composables/usePublish.ts:L48-L53`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/composables/usePublish.ts#L48-L53)
* **What Happens:** The modal promises: *"Published item will be available to everyone via a public link."*
* **Resulting Bug:** When confirmed, the modal immediately closes with a generic toast notification (`"Asset published"`). **The user is never shown the public link**, nor is there a "Copy Link" button. Although a public route exists on the backend ([`server/routes/public/[bucket]/[...path].ts`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/routes/public/%5Bbucket%5D/%5B...path%5D.ts)), users have no way to obtain the URL from the UI.

---

### 4.4 Dummy Admin Redirect Pages
* **Location:**
  - [`app/pages/admin/dlq.vue`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/pages/admin/dlq.vue): Only contains `navigateTo("/admin")`.
  - [`app/pages/admin/access-control.vue`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/pages/admin/access-control.vue): Only contains `navigateTo("/admin/settings")`.
  - [`app/pages/admin/folder-requests.vue`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/pages/admin/folder-requests.vue): Only contains `navigateTo("/admin?tab=folders")`.
* **What Happens:** These pages are empty router stubs that immediately forward users to other pages rather than rendering dedicated interfaces.

---

## 5. Recommended Action Plan & Fixes

### Phase 1: Immediate Security & Model Fixes
1. **Patch Invite Verification:** In [`server/api/auth/invite/[token].post.ts`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/api/auth/invite/%5Btoken%5D.post.ts#L24), verify that `invite.email.toLowerCase() === user.email.toLowerCase()`.
2. **Fix Claude Model Identifier:** Change the fallback default from `"claude-sonnet-4-6"` to `"claude-3-5-sonnet-20241022"` in [`processor.py`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/processor.py#L18) and [`llm_client.py`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/rag_parsers/llm_client.py#L49).
3. **Enforce Organization Scoping:** In [`server/utils/db.ts`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/server/utils/db.ts#L940), update `ensureFile(bucketName, id, orgId)` to always pass `orgId` to `getItemById`.
4. **Remove Hardcoded Key:** Remove the plaintext API key from [`scripts/inspect-pinecone.mjs`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/scripts/inspect-pinecone.mjs#L1) and read from `process.env.PINECONE_API_KEY`.

### Phase 2: UI & Feature Integrity
1. **Disable Fake Storage Connectors:** In [`app/pages/auth/select-storage.vue`](file:///c:/Users/Cog/Desktop/DAM-Tanish/digital-asset-management/app/pages/auth/select-storage.vue), mark OneDrive, SharePoint, Box, and Dropbox cards with a badge: *"Enterprise / Coming Soon"*, and prevent users from selecting them until backend drivers are built.
2. **Add "Copy Public Link" to Publish Dialog:** In `Publish.vue`, after publishing successfully, render a read-only input showing `${window.location.origin}/public/${bucket}/${file.id}` with a one-click copy button.
3. **Cross-Platform PPTX Parsing:** Replace `win32com` in `parse_pptx_v3.py` with LibreOffice headless CLI (`libreoffice --headless --convert-to pdf`) followed by PyMuPDF, which works consistently across both Windows and Linux Docker containers.
