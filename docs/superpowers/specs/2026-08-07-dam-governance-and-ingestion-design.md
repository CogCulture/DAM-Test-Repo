# DAM Governance and Ingestion Design

**Date:** 2026-08-07

**Status:** Approved design, pending written-spec review

## Goal

Complete five DAM capabilities without creating parallel implementations: universal file nomenclature enforcement, approved folder creation, hierarchical access control, actual-file import from links, and deterministic duplicate-content and filename handling.

## Scope and invariants

- The organization administrator configures department nomenclature segments, allowed segment values, and allowed file extensions.
- Nomenclature and extension rules apply to every role, including administrators and department heads, whenever enforcement is enabled.
- Every ingestion path uses the same policy and collision behavior: browser upload, public URL import, Google Drive import, local storage, BYOS, and Google Drive storage.
- A link import persists the actual file bytes in managed organization storage. It never creates only a shortcut or external reference.
- Authorization is enforced by server endpoints. UI visibility is convenience, not a security boundary.
- Existing uncommitted project work is preserved and adapted where it overlaps this design.

## Architecture

### Shared ingestion policy

Introduce focused shared utilities rather than repeating policy inside storage-specific routes:

1. A filename utility parses stems and extensions, strips an existing collision suffix, and generates the next case-insensitive available name using `name (n).ext`.
2. A nomenclature utility validates the filename stem against configured segments and their allowed values, then validates the extension against the configured allow-list.
3. An upload-planning utility receives the incoming name and hash plus lookup callbacks. It returns the final name, any canonical duplicate record, and whether storage bytes may be reused.
4. Storage adapters perform only backend-specific reads and writes after the shared plan succeeds.

This boundary keeps naming and governance deterministic while allowing local blob, BYOS, and Google Drive implementations to retain their existing APIs.

### Upload flow

All ingestion sources follow this sequence:

1. Authenticate the user and verify the destination bucket and department scope.
2. Require upload permission.
3. obtain a bounded byte payload and trustworthy filename candidate.
4. Load the destination department's effective nomenclature and governance settings.
5. Validate the requested filename and extension before persistence.
6. Compute a content hash.
7. Resolve same-name and same-content collisions.
8. Revalidate the resolved filename because adding ` (n)` can affect a strict nomenclature.
9. Reuse canonical stored bytes for identical content when the backend supports safe reuse; otherwise avoid an extra application-side download while retaining equivalent logical deduplication metadata.
10. Persist the database record and return the requested name, final name, rename reason, and duplicate status.

If any operation fails after a storage write, the endpoint removes the newly written object or restores the prior object so no partial asset remains.

## Feature 1: nomenclature and file-format enforcement

The `nomenclatures` record stores an optional JSON array of lowercase extensions without dots. `null` or an empty normalized array means any extension is accepted. The nomenclature API normalizes extensions, removes duplicates, rejects malformed values, and returns the effective configuration.

The admin nomenclature page edits both naming segments and extensions. Client validation mirrors server feedback, but every server ingestion route independently enforces the policy. Enforcement does not contain a role bypass. An administrator who needs an exception must change or disable the applicable rule explicitly.

Validation errors use HTTP 422 and explain the mismatched segment, allowed value, or extension. Invalid assets are not retained.

## Feature 2: folder-creation approval

Administrators and department heads may create folders directly. Other users may request folder creation only when their effective permissions allow that service. A request contains the organization, department, destination parent, requested folder name, requester, status, reviewer, decision note, and timestamps.

The relevant department head or any organization administrator may approve or reject a pending request. A department head may review only requests in their own department. A unique application-level check prevents duplicate pending requests for the same organization, parent, and case-insensitive folder name.

Approval resolves a last-minute folder-name collision using the same `name (n)` convention, creates the folder, and records the final name. Repeating a decision is rejected as a conflict rather than applying it twice. The requester can list their requests and see status, reviewer decision note, final folder name, and decision time. The admin queue shows all pending organization requests; department heads see only their department.

## Feature 3: hierarchy and granular access control

The fixed role order is:

`admin > dept_head > team_lead > team_member > intern`

Effective access combines role defaults, department scope, and nullable per-user overrides. The permissions include upload/write, create folder, rename, move, delete, share, publish, and other existing file operations exposed by the project. A user override wins when non-null; otherwise the role default applies.

Organization administrators manage defaults and overrides from a central access-control screen. Department heads may manage lower-ranked users only in their department. They cannot assign `admin`, assign a role equal to or higher than `dept_head`, move a user outside their department, or modify administrators and other department heads. Every mutating file endpoint calls the matching permission guard and department-scope guard.

## Feature 4: import actual files from links

The files interface exposes an "Import from link" action with a URL, optional filename override, and the current destination folder. The server supports public HTTP(S) URLs and common Google Drive sharing URLs.

For generic URLs, the server:

- permits only HTTP and HTTPS;
- resolves the hostname and rejects loopback, link-local, private, multicast, unspecified, and metadata-service addresses for IPv4 and IPv6;
- repeats address validation after every redirect;
- applies connection and total-operation timeouts;
- enforces a maximum size from headers and while streaming, without trusting `Content-Length` alone;
- derives a filename from the explicit override, `Content-Disposition`, URL path, or a safe content-type fallback;
- runs the shared upload pipeline before persistence.

For a Google Drive organization and recognizable Drive sharing link, the server uses the authenticated Drive API to obtain metadata and copy or download/upload the actual file into the selected organization folder. It must not store a `.gdrive-link`, internet shortcut, or dependency on continued public sharing. Non-Drive public links are downloaded and uploaded to Drive through the same bounded ingestion flow.

Private, malformed, oversized, timed-out, or unsafe links return a clear 4xx/5xx response and leave no partial record.

## Feature 5: content deduplication and deterministic renaming

Filename occupancy is case-insensitive within the destination folder.

- When the requested name is free and content is new, keep the requested name.
- When the requested name exists but content differs, save the incoming asset as `name (1).ext`, incrementing until free.
- When identical content already exists under another name, treat the first stored asset as canonical, reuse its storage bytes where safe, and create the incoming logical record using `canonical name (1).ext`, incrementing within the destination folder.
- Repeated collisions do not stack suffixes. For example, collision resolution from `Report (1).pdf` continues from the base `Report.pdf`.

The response contains `requestedName`, `finalName`, `renamed`, `renameReason`, `duplicate`, and the canonical file identifier when applicable. The UI reports automatic renames rather than applying them silently.

Hash lookup may be organization-wide for storage deduplication, while filename availability is always scoped to the destination parent. The application never exposes or reuses bytes across organizations.

## Error handling and transaction boundaries

- Authorization failures return 403 without storage access.
- Missing or inaccessible destinations return 404.
- Malformed input returns 400; governance violations return 422; stale approval decisions and other state conflicts return 409.
- External fetch failures distinguish inaccessible links, timeouts, and upstream failures where practical.
- Database and storage operations use compensating cleanup when they cannot share a transaction.
- Error messages do not disclose credentials, internal network details, signed URLs, or another organization's assets.

## Testing strategy

Pure unit tests cover extension normalization, nomenclature segment validation, collision suffix stripping, case-insensitive numbering, canonical duplicate naming, role rank checks, effective permission resolution, folder-creation policy, Drive-link parsing, and URL-address rejection.

Endpoint tests cover universal nomenclature enforcement, unauthorized mutations, department-head scope, administrator approval, duplicate pending requests, repeated decisions, URL size and redirect limits, cleanup on failed persistence, and response rename metadata.

Integration coverage exercises the same file fixture through manual/local upload, URL import, and Google Drive upload planning to prove that all paths produce the same final name and deduplication decision. Final verification runs the focused tests, complete test suite, lint, type/build preparation, and production build.

## Acceptance criteria

1. An enabled naming or extension rule cannot be bypassed by role, storage backend, or link import.
2. Non-privileged folder creation produces a reviewable request; only an authorized department head or administrator can decide it.
3. Role and per-user permissions are enforced consistently at every relevant server mutation boundary, without privilege escalation.
4. Importing a supported link creates an independently managed file containing the source bytes.
5. Same-name and same-content collisions use deterministic ` (n)` naming, reuse storage safely, and report the final name to the user.
