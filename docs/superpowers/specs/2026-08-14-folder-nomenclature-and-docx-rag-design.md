# Folder Nomenclature and DOCX RAG Design

## Objective

Extend the existing department-level nomenclature feature so administrators can configure a folder naming template using the same segment model as file naming, while keeping file and folder templates independently named. Enforce the folder template for every newly created folder, including nested directories introduced by folder uploads. Repair the currently advertised DOCX RAG path by declaring and validating its missing Python dependency.

## Current State

- File nomenclature stores ordered segments and allowed file extensions per department.
- Upload endpoints enforce file nomenclature on individual files.
- Folder creation permissions and approval workflows exist, but folder names are not governed by nomenclature.
- Folder picker and drag-and-drop uploads preserve relative paths and create intermediate folders.
- Both local and Google Drive RAG endpoints advertise `.docx` support and route DOCX files to `parse_docx.py`.
- `parse_docx.py` imports the `docx` module, but `python-docx` is absent from `server/utils/rag_parsers/requirements.txt`; the active Python environment therefore fails before extraction.

## Data Model

Add two nullable fields to the existing `nomenclatures` table:

- `folder_template`: the normalized underscore-separated segment keys.
- `folder_segments`: JSON containing ordered `{ key, label, allowedValues }` items.

Existing rows remain valid. An absent or empty folder template means folder nomenclature is not configured and folder names retain their current behavior. File nomenclature fields and semantics remain unchanged.

The migration must be additive and idempotently applied by the existing SQLite migration workflow.

## Admin Experience

The existing Nomenclature page will contain two clearly separated editors:

1. **File naming** retains the existing segments, preview, and extension controls.
2. **Folder naming** reuses the same segment editor behavior but has independent segment keys, labels, allowed values, ordering, and preview.

Example configuration:

- File: `Brand_Project_MediaType_Version`
- Folder: `Brand_Project_Year`

Saving updates both templates for the selected department in one request. Legacy API responses without folder fields are normalized to empty folder segments so the page cannot fail during rendering.

## Validation Rules

A shared folder-name validator will use the same underscore-separated segment semantics as file validation:

- The number of non-empty values must equal the configured folder segment count.
- Values for segments with an `allowedValues` list must match one of those values.
- Segment keys and allowed values cannot contain underscores.
- Path separators, traversal segments, and empty names remain invalid under existing path safety rules.

The validator returns a clear message that identifies the expected folder template or the segment that failed.

Folder governance is active only when the organization nomenclature feature is enabled, nomenclature enforcement is enabled, and the target department has configured folder segments. Existing folders are not revalidated or renamed.

## Enforcement Boundaries

Server-side validation is mandatory at every creation boundary:

- Local direct folder creation.
- Google Drive direct folder creation.
- Folder request submission.
- Folder request approval, using the final approved name.
- Intermediate directories created by local directory uploads.
- Intermediate directories created by Google Drive directory uploads.

The department used for policy resolution is the selected upload department when supplied; otherwise it is the actor's effective department under existing authorization rules.

## Directory Upload Preflight

Before uploading bytes, the client derives the unique directory names from every file's `webkitRelativePath` or `customPath`, including the selected top-level folder and every nested folder. It submits those directory paths and the selected destination/department to a preflight endpoint.

The server authorizes the destination, loads the effective folder nomenclature, validates every path segment, and returns all violations in one response. The client starts the existing upload loop only after preflight succeeds. This prevents ordinary UI uploads from partially succeeding because of a later invalid directory.

Each individual upload endpoint also validates its relative directory path as a security backstop. This protects against direct API calls and stale clients. The existing file nomenclature validation continues unchanged.

Completely empty directories cannot be represented by the browser directory picker and remain outside this change. Any nested directory containing at least one file is preserved and validated.

## DOCX RAG Repair

- Add `python-docx` to `server/utils/rag_parsers/requirements.txt`.
- Wrap the DOCX parser import in `processor.py` with the same actionable missing-dependency error style used by the PDF path.
- Keep `.docx` in both RAG endpoint allowlists and continue using the existing Markdown artifact and Pinecone embedding pipeline.
- Do not change DOCX source filenames or introduce a new artifact naming convention.

Deployment environments must install the updated requirements with the same Python interpreter configured for the application.

## Error Handling

- Manual creation returns HTTP 400 with the exact folder naming requirement when invalid.
- Directory preflight returns HTTP 400 with a list of invalid relative folder paths and messages.
- Folder request submission rejects invalid names before creating a pending request.
- Approval revalidates the final folder name so reviewers cannot bypass governance by editing it.
- DOCX dependency failures report that `python-docx` must be installed from the RAG requirements file rather than exposing a raw import traceback.

## Testing

Tests will be written before production changes and will cover:

- Folder segment normalization and validation.
- Unconfigured folder rules preserving existing behavior.
- Valid and invalid local and Google Drive folder creation contracts.
- Folder request submission and final-name approval enforcement.
- Nested upload path extraction and full preflight rejection.
- Server-side relative-path enforcement for both storage providers.
- Legacy nomenclature responses without folder fields.
- `python-docx` being declared in the RAG requirements.
- DOCX routing producing an actionable dependency error when the module is unavailable.
- The complete existing verification suite to confirm file upload, file nomenclature, authorization, Drive routing, and RAG search behavior remain intact.

## Compatibility and Scope

- No existing folder is renamed.
- No existing file nomenclature field or endpoint behavior is removed.
- No upload destination, Google Drive permission, RAG artifact, or search-result behavior is redesigned.
- No repository push is part of this work.
