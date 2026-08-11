# Additive Upload Nomenclature Policy Design

## Goal

Provide an administrator-configurable file naming policy that guides users to a compliant filename and guarantees that non-compliant files cannot be stored, without rewriting the existing upload, folder, Google Drive, RAG, search, or preview flows.

## Selected User Experience

The feature uses a guided correction workflow backed by strict server validation:

1. An administrator selects a department and defines an ordered naming template such as `Brand_Project_MediaType_Version`.
2. Each segment has a display label and may either accept free text or restrict users to administrator-defined values.
3. The administrator may optionally restrict permitted file extensions.
4. When enforcement is enabled, the upload wizard shows the original filename, collects each segment value, previews the compliant target filename, and disables upload until every value and extension is valid.
5. The server independently validates the final filename. A direct request or altered client cannot bypass the policy.

## Isolation Boundary

The current application already contains nomenclature configuration, validation, and upload-wizard functionality. This work is a verification and hardening layer rather than a replacement.

- Existing upload handlers and UI components remain structurally unchanged when they already satisfy the contract.
- New behavior is developed first in isolated shared policy contracts and tests.
- Existing files are changed only if a failing test proves an integration defect that cannot be corrected additively.
- No unrelated refactoring, styling, route changes, storage changes, or permission changes are allowed.

## Policy Model

A policy is scoped to an organization and department and contains:

- `enabled`: whether nomenclature enforcement is active.
- `separator`: underscore for the first version.
- `segments`: an ordered list of `{ key, label, allowedValues }`.
- `allowedExtensions`: an optional normalized list without leading dots.

The file extension is not part of the segment count. Given four segments, `Acme_Launch_Video_v2.mp4` is valid when each value satisfies its corresponding rule and `mp4` is permitted.

Segment keys and allowed values cannot contain underscores because underscore is the delimiter. Empty segment values are invalid. Extension matching is case-insensitive.

## Authorization

- Organization administrators may configure policies for any department in their organization.
- Department heads may configure a policy only when their existing `canEditNomenclature` permission authorizes it and only for their own department.
- Upload enforcement applies to all roles, including administrators.
- The server treats client-supplied department and filename values as untrusted.

## Validation and Error Handling

Validation returns one actionable failure at a time:

- Missing policy: no template is configured for the target department.
- Wrong shape: filename does not contain the required number of ordered segments.
- Invalid segment: a value is not in the administrator's allowed list.
- Invalid extension: the file type is outside the permitted list.

The wizard uses the same policy contract to show immediate feedback, while the server remains authoritative. Invalid files are not uploaded and no partial storage record is created for the rejected file.

## Existing Flow Compatibility

The policy must work with:

- device file uploads;
- device folder uploads with preserved directory structure;
- organization-root and selected-folder uploads;
- Google Drive storage and local development storage;
- URL and Google Drive link imports where the application assigns a final filename;
- collision naming, without allowing a collision suffix to invalidate or bypass the configured policy.

RAG parsing and indexing begin only after a file has passed validation and been stored successfully.

## Verification

- Unit tests cover valid templates, wrong segment counts, allowed-value failures, extension failures, case handling, and enforcement across every role.
- Integration-focused tests confirm a valid guided filename is accepted and a direct invalid filename is rejected.
- The complete existing test suite and production build must remain green.
- Authenticated browser validation covers admin configuration, wizard preview, invalid submission blocking, successful compliant upload, and confirmation that the rejected file is absent.
