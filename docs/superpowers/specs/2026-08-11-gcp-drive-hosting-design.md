# GCP-Only Hosting and Asset Actions Design

## Goal

Prepare the DAM application for a deadline-compatible deployment on Google Cloud Platform, store document bytes in Google Drive, preserve the existing governance features, and make the Asset actions panel reliably visible.

## Scope

This design covers:

- a production Node.js deployment on one Google Compute Engine VM;
- a Docker image containing the Nuxt server and Python dependencies required by RAG processing;
- a persistent SQLite metadata database on a mounted VM disk;
- Google Drive as the document-storage backend;
- production environment and OAuth configuration;
- repeatable database migration and application startup;
- health checks and deployment documentation;
- a reliable Asset actions floating panel;
- automated and browser-level verification.

It does not cover horizontal scaling, Cloud SQL migration, Kubernetes, or multi-region high availability. Those require replacing the current SQLite/D1-oriented data layer and are outside the deadline-compatible scope.

## Architecture

### Runtime

The Nuxt application will build with Nitro's `node-server` preset and run as a Docker container on a single Compute Engine VM. The server will listen on `0.0.0.0` and use the configured `PORT`, defaulting to `8080` in production.

The container will include Node.js and Python 3. The production image will contain only the runtime output, required server dependencies, migration files, and RAG parser dependencies.

### Metadata database

The application currently uses a SQLite schema through Drizzle but obtains its production connection from NuxtHub's Cloudflare D1 binding. GCP production will replace that binding with a local SQLite connection backed by `better-sqlite3`.

The database path will be configured by `DATABASE_PATH`, with a production default under `/var/lib/dam/database.sqlite`. The VM will mount a persistent disk at `/var/lib/dam`. Database initialization will apply the existing ordered SQL migrations before the application starts.

This architecture deliberately runs one application instance. SQLite must not be shared by multiple Cloud Run or VM instances. A future horizontally scaled deployment must migrate the schema to Cloud SQL first.

### Document storage

Google Drive will be the production document store. The existing organization Google Drive connection, folder selection, upload, URL import, rename, delete, download, nomenclature and duplicate-hash flows will remain the document path.

The metadata database will store user and organization data, permissions, folder approvals, nomenclature rules, hashes, logical paths and Google Drive identifiers. It will not be used to store document bytes.

For organizations configured for Google Drive:

1. The administrator connects a Google account and chooses the approved root folder.
2. Uploads and URL imports write the file to that Drive folder.
3. Folder creation uses the existing approval and Google Drive folder APIs.
4. DAM metadata records the Drive file identifier and content hash.
5. Duplicate content receives the canonical numbered DAM name before creation in Drive.

Local and Cloudflare blob storage will not be part of the documented GCP production path. Existing local development behavior remains available for developers.

### Authentication and secrets

The production deployment will require:

- `NUXT_PUBLIC_SITE_URL` set to the public HTTPS origin;
- Google OAuth client ID, client secret and redirect URL;
- session and Super Admin secrets of at least 32 characters;
- optional GitHub OAuth credentials;
- optional Anthropic and Pinecone credentials for RAG;
- `DATABASE_PATH=/var/lib/dam/database.sqlite`;
- `LOCAL_DAM_STORAGE_DIR=/var/lib/dam/files` as a non-production fallback only.

Secrets will be supplied to the VM at deployment time through a protected environment file. The file will not be copied into the image or committed to Git. The Google OAuth callback will be `<public-origin>/api/auth/google`.

### Network and HTTPS

The container exposes port `8080`. The initial deployment may be tested through the VM's external address and firewall rule. Production Google OAuth requires a stable HTTPS origin, so the deployment guide will require a domain and HTTPS reverse proxy before final OAuth validation.

The application will expose a lightweight health endpoint that verifies the server is responding without returning secrets or user data. VM and container health checks will use this endpoint.

## Asset actions repair

The existing Asset actions control uses a third-party popover portal inside a page with nested scrolling and stacking contexts. The open state changes, but the rendered content can be positioned or layered outside the visible workspace.

The repaired control will use an application-owned teleported panel:

- the trigger remains in the workspace header;
- opening the trigger renders the panel under `document.body`;
- the panel is fixed below and right-aligned to the trigger, then clamped within the viewport;
- the panel uses an explicit application z-index above the authenticated shell;
- it repositions on resize and scroll;
- clicking outside, pressing Escape, choosing an action, or pressing Close dismisses it;
- focus returns to the trigger after dismissal;
- its content remains scrollable on short screens;
- the trigger exposes `aria-expanded` and `aria-controls`, while the panel uses `role="dialog"` and an accessible label.

Positioning logic will live in a focused composable so it can be tested independently from the large files view component.

## Files and responsibilities

- `nuxt.config.ts`: select a configurable Nitro preset and disable development-only tooling in production.
- `server/utils/drizzle.ts`: choose local SQLite on GCP and retain the existing development adapter where appropriate.
- `server/utils/sqlite.ts`: own the singleton SQLite connection and migration initialization.
- `server/api/health.get.ts`: provide a safe liveness response.
- `app/composables/useFloatingPanel.ts`: calculate, update and clean up Asset actions panel positioning.
- `app/components/App/Files.vue`: render and control the teleported Asset actions panel.
- `Dockerfile`: build and run the Nuxt Node server with the required system runtime.
- `.dockerignore`: exclude secrets, local data, build output and development artifacts.
- `docker-compose.gcp.yml`: define the single-instance service and persistent data mount.
- `.env.gcp.example`: document required production configuration without secret values.
- `scripts/start-gcp.mjs`: apply SQLite migrations and start the built server.
- `scripts/deploy-gce.ps1`: provide repeatable PowerShell-oriented deployment commands without embedding credentials.
- `docs/GCP_DEPLOYMENT.md`: document Google Cloud Console, VM, disk, firewall, Docker, DNS, HTTPS and OAuth steps.
- `tests/gcp-hosting.test.mjs`: verify deployment contracts and configuration safety.
- `tests/floating-panel.test.mjs`: verify viewport clamping and positioning behavior.

## Error handling

- Startup fails with a clear message when the data directory is not writable or migrations fail.
- Production startup fails when required session, Super Admin or Google OAuth settings are absent.
- Google Drive operations continue to return actionable API errors through the existing toast and endpoint handling.
- The Asset actions panel falls back to a viewport-safe upper-right position if its trigger cannot be measured.
- Deployment instructions include database backup and rollback commands before replacing an existing container.

## Migration and compatibility

Existing SQL migration files remain the source of truth. A fresh GCP deployment creates the SQLite database and applies every migration in order. Moving existing local metadata is optional and requires copying the current SQLite database to the persistent disk while the application is stopped.

Existing Cloudflare configuration files are not deleted because they may belong to prior work. The GCP build explicitly selects the Node server preset and does not require Cloudflare bindings.

## Verification

The implementation is accepted when all of the following are true:

1. The deployment contract tests fail before implementation and pass afterward.
2. The floating-panel positioning tests fail before implementation and pass afterward.
3. The existing 62 feature tests still pass.
4. A production `node-server` build exits successfully.
5. The built server starts against a temporary persistent SQLite path.
6. `/api/health`, `/auth/signin`, `/org`, `/superadmin/login`, and `/superadmin/users` respond as expected.
7. Super Admin login and its protected users API succeed using the issued session.
8. In a browser, Asset actions opens visibly within the viewport, contains upload/link/folder/sort/filter/view controls, closes through its supported dismissal paths, and produces no console errors.
9. No secret values or local data are included in the Docker build context or generated deployment files.

## Operational limits

- Run exactly one application container against the SQLite database.
- Back up the persistent database before upgrades.
- Google Drive API quotas and OAuth token validity remain external dependencies.
- RAG processing can be CPU- and memory-intensive; the VM sizing guide will recommend at least 2 vCPU and 4 GB RAM, with a larger machine for concurrent parsing.
- Horizontal scaling requires a separate Cloud SQL migration project.
