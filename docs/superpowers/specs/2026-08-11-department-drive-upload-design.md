# Department-Targeted Google Drive Upload Design

## Objective

Restore trustworthy device-upload feedback and let users choose an authorized department as the upload destination. A department-targeted upload must write the binary into that department's real Google Drive folder and then make it visible from the same department in the DAM workspace.

This change is limited to upload destination selection, upload authorization, upload progress, and post-upload refresh behavior. Search, RAG, previews, sharing, publishing, renaming, deletion, and unrelated workspace behavior are out of scope.

## Existing Behavior and Confirmed Failure Mode

The device picker accepts files and the Google Drive upload eventually succeeds. The observed upload took roughly one minute. While the synchronous Drive upload and subsequent listing request run, the current file list is cleared and the workspace temporarily reports `0 assets`. The interface therefore makes a slow successful upload look like a failure.

Each configured organization department already has an `org_departments.gdrive_folder_id` value that points at its real Google Drive folder. The existing upload endpoint accepts a raw parent folder ID and derives nomenclature from the uploader's home department; it does not accept an explicit department destination or authorize one independently.

## User Experience

The existing upload control gains a destination selector next to the file/folder upload action.

- Organization administrators may select the organization root or any mapped department.
- Other users may select only departments included in their effective department access list.
- The existing destination remains the default: organization root for administrators and the user's current/home department for non-administrators when available.
- A department without a valid Google Drive folder mapping is shown as unavailable with a clear explanation and cannot be submitted.
- The selected destination applies to both file uploads and folder uploads.

When an upload starts, the existing asset cards remain visible. The control displays the selected destination and advances through stable states:

1. `Uploading to <destination>` while bytes are sent and Drive processes the upload.
2. `Syncing with Google Drive` while the DAM refreshes the selected folder.
3. A success notification containing the final filename and destination.

After a department upload succeeds, the workspace refreshes the sidebar and navigates to the selected department's Drive folder so the new asset is immediately visible. A root upload retains the current route. Failures preserve the existing asset list and display the server-provided error.

## API and Authorization

Add an authenticated read endpoint that returns upload destinations for the current organization. Each destination contains only the fields required by the client:

```ts
type UploadDestination = {
  id: "root" | string;
  name: string;
  type: "organization" | "department";
  available: boolean;
  unavailableReason?: string;
};
```

The endpoint returns the organization root only to administrators. It returns every organization department to administrators and only effectively accessible departments to other users. It never exposes Google Drive folder IDs to the browser.

The Google Drive upload endpoint accepts an optional `departmentId` in addition to its existing route-derived parent behavior. When `departmentId` is present, the server:

1. Loads the department inside the authenticated user's organization.
2. Rejects cross-organization, unknown, or inaccessible departments.
3. Requires a non-empty `gdriveFolderId` mapping.
4. Uses that mapped folder ID as the Drive parent.
5. Applies nomenclature and extension governance for the selected department.

When `departmentId` is absent, the endpoint preserves the current root/current-route behavior for compatibility. A client-supplied raw Drive parent ID must not override an explicit department destination.

Authorization remains enforced by `requireFilePermission(event, "canUpload")`. Administrators pass department scope checks for their organization. Other roles must have the selected department in `accessibleDepartmentIds`.

## Client Data Flow

`Upload.vue` loads authorized destinations when rendered for a Google Drive organization and owns the selected destination state. The same state is passed into the nomenclature upload modal so governed and ungoverned uploads resolve the same target.

For each selected file, the client sends the stable department ID rather than a Drive folder ID. The server response includes the final filename and a safe destination descriptor needed for confirmation and navigation. After the complete batch succeeds, the client increments the existing refresh trigger and navigates to the department's mapped workspace route returned by the server.

The file-list composable keeps the last successful list during a reset fetch. It sets loading/error state without assigning an empty array before the replacement response succeeds. Pagination still clears only when the first replacement page has arrived.

## Error Handling

- `400`: missing/invalid destination input or department without a Drive mapping.
- `403`: upload permission denied or department outside effective access.
- `404`: selected department no longer exists in the organization.
- `409`: selected destination changed or became unavailable during upload preparation.
- `422`: selected department's nomenclature or extension rules reject the file.
- `502`: Google Drive rejects or fails the upload.

The client shows the response message, retains the current asset list, leaves the destination selection intact for retry, and resets only per-file progress state.

## Testing

Pure authorization and routing tests cover:

- Administrators receive root plus every mapped organization department.
- Non-administrators receive only effectively accessible departments.
- Cross-organization and inaccessible department IDs are rejected.
- An explicit department resolves to its mapped Google Drive folder.
- A missing mapping is rejected without falling back to the organization root.
- Explicit department routing takes precedence over a raw parent ID.
- Governance resolves from the selected department rather than the uploader's home department.

Client regression checks cover:

- Existing cards remain visible while upload and refresh are pending.
- File and folder uploads send the selected department ID.
- The nomenclature modal preserves the same destination.
- Success navigates to and refreshes the selected department folder.
- Failure preserves the current list and displays the server message.

End-to-end verification uploads a uniquely named small file to one department, confirms it appears in that department's DAM route and real Google Drive folder, then moves the test artifact to Trash.

## Non-Goals

- Automatic RAG processing or Markdown generation.
- Changes to Smart Search.
- A raw Google Drive folder browser.
- Creating, renaming, or deleting departments.
- Changes to preview, sharing, publishing, favorites, or other DAM actions.
