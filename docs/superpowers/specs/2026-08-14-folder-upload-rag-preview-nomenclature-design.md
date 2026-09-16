# Folder Upload, RAG Performance, Preview, and Nomenclature Design

## Goal

Repair four connected DAM workflows: recursive local-folder upload, DOCX RAG latency, document preview presentation, and superadmin-controlled file nomenclature enforcement.

## Folder Upload

The upload surface will prefer the browser File System Access API when `showDirectoryPicker` is available. After the user grants access to a source directory, the client recursively enumerates every nested directory and file. Files retain a normalized relative path beginning with the selected top-level directory. The client also produces a directory manifest so supported browsers can preserve empty directories.

The current `webkitdirectory` input remains as the compatibility fallback. It preserves every directory represented by at least one selected file through `webkitRelativePath`; browsers using this fallback cannot expose empty directories.

The browser owns the operating-system folder picker, so DAM cannot redefine Windows double-click behavior inside that picker. The complete hierarchy begins uploading after the user confirms the selected directory. The existing folder-nomenclature preflight runs before file bytes are uploaded. Directory creation and file upload use normalized paths, reject traversal, and retain nested structure under the selected DAM destination.

Failures report the affected relative path. Successful items remain successful rather than being silently rolled back, and the final result summarizes uploaded files, created directories, duplicates, and failures.

## DOCX RAG Performance

DOCX parsing currently submits every request to the Anthropic batch API even when `RAG_USE_BATCH` is false. The processor will honor that setting. Interactive DOCX moves use the synchronous Messages API by default; batch processing remains available only when explicitly enabled.

The processor will expose stage progress for document extraction, AI analysis, embedding, and artifact persistence. Existing generated-artifact reuse remains the first path and costs no new model call. The change removes avoidable batch-queue latency but does not promise a fixed duration because document size, images, model response time, network latency, and embedding time remain variable.

## Floating Document Preview

Double-clicking a file opens a centered preview modal inside DAM. Before opening it, the asset-actions/upload overlay closes. The preview is portaled to the document body and receives a layer above all workspace panels and overlays.

On desktop, the modal occupies at most 92 percent of the viewport with a bounded document canvas and metadata sidebar. On smaller screens it becomes a near-fullscreen stacked layout. It retains file actions, previous/next navigation, filename, close control, and the current PDF, text, Office, image, and fallback renderers. Background scrolling is blocked while the modal is open, and Escape or the close button dismisses it.

## Superadmin Nomenclature

Nomenclature remains department-scoped and organization-owned. The superadmin organization view will expose a department selector and the same ordered segment configuration used by the administrator nomenclature editor: segment key, label, allowed values, separator behavior, preview, allowed extensions, and enforcement state.

The server remains the authority. Every file-ingress route resolves the target organization and department, loads the effective policy, and validates the final filename before storing bytes or creating metadata. This includes local upload, Google Drive upload, URL import, and folder upload. Folder paths continue to use the independently configured folder nomenclature policy.

The DAM upload interface fetches the effective rule to guide the user and can construct a compliant name, but client-side validation is only assistance. Direct or stale clients cannot bypass the server rule. Existing files are not renamed retroactively. Changing a policy affects subsequent uploads only.

## Errors and Compatibility

- Unsupported directory APIs fall back to the hidden directory input.
- Permission cancellation returns control without an error toast.
- Invalid or unsafe paths are rejected before upload.
- Nomenclature errors identify the offending name and required pattern.
- RAG failures identify the processing stage when possible.
- Preview load failures remain contained inside the modal and offer download as a fallback.

## Verification

Automated coverage will verify recursive directory enumeration and relative paths, fallback picker behavior, directory-manifest dispatch, synchronous-versus-batch DOCX routing, preview overlay ordering and action-panel closure, superadmin nomenclature wiring, and server-side enforcement contracts. The complete repository test suite and Nuxt production build will run after targeted tests.

## Success Criteria

An authorized user can select a source directory once, upload its visible nested hierarchy into the chosen DAM folder, and see the hierarchy preserved. DOCX RAG no longer waits on the batch queue unless batch mode is explicitly enabled. Double-click opens an unobstructed floating preview. Superadmins can configure department file nomenclature, and all upload routes enforce it before persistence.
