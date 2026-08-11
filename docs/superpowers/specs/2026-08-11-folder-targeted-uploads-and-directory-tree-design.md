# Folder-Targeted Uploads and Directory Tree Design

## Objective

Allow an authorized workspace user to choose an existing DAM folder and upload files or complete directories into that exact folder. Directory uploads preserve the selected directory as a child of the destination and recreate every nested folder and file. The workspace sidebar renders the resulting hierarchy as expandable folders with indented child folders and files.

## User Experience

### Destination selection

- Opening a folder in the workspace makes that folder the active upload destination.
- The upload controls display the active destination path before the device picker opens.
- An authorized folder selector lets the user change the destination without navigating away.
- The organization root remains available only to roles already authorized to upload there.
- Unavailable or unauthorized folders are omitted rather than shown as selectable targets.

### File upload

- Selecting one or more files uploads them directly into the active destination folder.
- The progress state names the destination and reports failures instead of silently discarding a selection.
- After completion, the asset grid and directory tree refresh while retaining their existing contents until replacement data arrives.

### Directory upload

- Selecting a directory preserves its top-level directory and all nested paths.
- For example, uploading `Campaign Assets/Images/logo.png` into `Marketing` creates `Marketing/Campaign Assets/Images/logo.png`.
- Existing folders with the same name are reused when they are valid destinations; files continue to use the existing collision and duplicate policies.
- Empty directories are not created because browser directory pickers do not reliably expose them as upload entries.

### Directory tree

- Folder rows are expandable and navigable.
- Expanded folders fetch their immediate children on demand.
- Child folders appear before child files, with both rendered as indented sub-list items.
- Clicking a folder opens it and selects it as the upload destination.
- Clicking a file uses the existing preview behavior.
- Refreshing after upload keeps expanded branches open and reloads only affected branches where practical.

## Architecture

### Folder destination contract

A shared destination model represents:

- folder ID;
- display name;
- full breadcrumb path;
- parent ID;
- item type;
- availability and authorization state.

The client sends only the selected folder ID. The server resolves and validates the folder within the authenticated user's organization and connected Google Drive. Client-provided names, paths, or raw Google Drive IDs are never trusted for authorization.

### Folder listing

The existing immediate-child listing routes remain the source of truth. A dedicated authorized upload-folder endpoint returns normalized folder destinations for the selector and omits files and inaccessible folders. The directory tree loads immediate children lazily so large Drive hierarchies do not require a full recursive request.

### Upload path resolution

The upload client sends:

- the authorized destination folder ID;
- each file's browser-provided relative path;
- the file body.

For directory uploads, the server splits the normalized relative path into directory segments and creates or reuses each segment beneath the validated destination. Path traversal markers, absolute paths, empty segments, and invalid Drive names are rejected or normalized using one shared path policy. The final file is uploaded to the resolved leaf folder.

For individual files, the destination folder is used directly and no additional directory is created.

### Google Drive consistency

- Folder creation and file upload use the organization's approved Google Drive connection.
- Created folders and files therefore appear immediately in the mapped `DAM Testing` Drive hierarchy.
- The DAM database stores or refreshes mirror metadata required by the existing workspace, RAG, preview, and search flows.
- The server returns the resolved destination route so the client can remain in or navigate to the uploaded folder.

## Authorization

- Administrators may select the organization root and every authorized department/folder.
- Other users see only folders reachable through their effective department and explicit access rules.
- Every upload and folder-creation request revalidates organization membership and folder access on the server.
- A crafted folder ID from another organization, an inaccessible department, or an unmapped Drive location is rejected without falling back to root.
- Existing nomenclature, allowed-extension, collision, duplicate, and RAG permissions continue to apply.

## Error Handling

- A missing destination prevents the picker from starting and shows a clear message.
- A destination that becomes unavailable is rejected before any file is uploaded.
- A failed nested-folder creation identifies the relative directory that failed.
- Partial directory uploads report completed and failed files; successfully created Drive items are not deleted automatically.
- The client keeps existing cards and tree nodes visible during refresh.
- Upload controls cannot fail silently: controller, policy, network, and server errors produce visible feedback.

## Testing

Automated coverage will verify:

- authorized folder choices and rejection of inaccessible/cross-organization IDs;
- individual files target the chosen folder;
- directory relative paths preserve the top-level directory and nested hierarchy;
- unsafe relative paths are rejected;
- existing folders are reused and file collision behavior remains intact;
- the upload dispatcher does not silently discard selected files;
- directory-tree normalization orders folders before files and preserves nesting;
- pending refreshes retain current grid and tree content.

Rendered validation will cover:

- selecting a folder from the tree updates the upload destination;
- selecting another folder from upload controls changes the target;
- uploading a file displays it under the selected folder;
- uploading a nested directory renders the expected expandable sub-list;
- the created hierarchy is reflected in Google Drive;
- browser console and server logs remain free of relevant errors.

## Non-Goals

- Moving or copying existing assets between folders.
- Creating empty directories from a browser directory selection.
- Redesigning search, preview, RAG parsing, or nomenclature rules.
- Loading an entire large Drive recursively in one request.

## Success Criteria

The feature is complete when an authorized user can select an existing workspace folder, upload either files or a nested directory into it, see the preserved hierarchy in the expandable workspace tree, and verify the same hierarchy inside the connected Google Drive folder without affecting unrelated DAM behavior.
