# GCE Persistent Local Storage Design

## Objective

Deploy the DAM as a production Docker service on one Google Compute Engine VM while storing the SQLite database and uploaded asset bytes on a Google Compute Engine Persistent Disk. Google authentication remains available for company identity, but Google Drive is not required as the organization's storage backend.

The local asset library may start empty. Existing database-backed structure and configuration—including organizations, departments, folder records, permissions, nomenclature, taxonomies, and application settings—must not be reset or destroyed.

## Scope

This change provides:

- a production Docker deployment for a single GCE VM;
- a host bind mount from `/var/lib/dam` into the application container;
- persistent SQLite metadata at `/var/lib/dam/database.sqlite`;
- persistent uploaded assets below `/var/lib/dam/files`;
- identity-only Google OAuth as the default company-login flow;
- optional Google Drive functionality retained for backward compatibility;
- startup validation, container health checks, resource limits, graceful shutdown, and operational documentation;
- backup and restore procedures for both metadata and file bytes;
- a safe migration procedure that preserves the existing SQLite database and starts the local binary library empty.

This change does not provide:

- migration of existing Google Drive file bytes;
- horizontal scaling or multiple application replicas;
- Cloud SQL, Filestore, or Cloud Storage integration;
- automatic creation of GCP infrastructure from inside the application;
- deletion of existing Google Drive code, records, routes, or UI needed by organizations that still use Drive.

## Architecture

The production topology is:

```text
Company users
    |
Google OAuth for identity (openid, email, profile)
    |
HTTPS reverse proxy or load balancer
    |
Single Docker container on one GCE VM
    |
Host bind mount: /var/lib/dam -> /var/lib/dam
    |-- database.sqlite
    `-- files/
```

The VM's RAM runs Docker, Nuxt, SQLite queries, upload buffers, and document-processing jobs. It is not durable storage. A GCE Persistent Disk supplies `/var/lib/dam`, so application state survives container replacement and VM restart.

The deployment remains at exactly one application replica while SQLite and a directly mounted disk are used. Scaling to multiple replicas requires a separate architecture using shared asset storage and a network database.

## Storage Selection and Compatibility

The existing organization storage discriminator remains authoritative:

- `gdrive` continues to use the existing Google Drive paths.
- `byos` continues to use the existing bring-your-own-storage paths.
- `s3` is the legacy value for platform-managed storage and continues to resolve to the local filesystem in the node-server deployment.

No database enum or existing organization record is destructively rewritten as part of application startup. The production deployment defaults and onboarding language identify `s3` as "Platform storage" or "GCP instance storage" rather than presenting it as Google Drive.

Local uploads are written beneath `LOCAL_DAM_STORAGE_DIR`. Path resolution must continue to prevent traversal outside that root. The container must fail startup when its persistence directory is missing, not writable, or configured inconsistently.

## Data Preservation and Cutover

The production data root is `/var/lib/dam` on the VM. It is bind-mounted into the container at the same path.

Cutover follows these rules:

1. Stop the running application before copying or restoring SQLite.
2. Back up the existing database before any migration or organization-storage change.
3. Place the preserved database at `/var/lib/dam/database.sqlite`.
4. Create an empty `/var/lib/dam/files` directory when Drive file bytes are not being migrated.
5. Change the target organization's storage type to platform-managed local storage through an explicit administrator operation, not an automatic startup rewrite.
6. Run existing idempotent database migrations before starting Nuxt.
7. Verify departments, permissions, nomenclature, taxonomy, and folder metadata before accepting new uploads.

Historical rows that point only to Google Drive may remain as historical metadata. The cutover must not fabricate local files for them or silently delete those records.

## Docker Runtime

The existing multi-stage Dockerfile remains the foundation. The runtime must:

- use the Node server Nitro preset;
- run as the existing non-root `dam` user;
- listen on `0.0.0.0:8080`;
- use `/var/lib/dam/database.sqlite` and `/var/lib/dam/files`;
- run startup validation and idempotent SQLite migrations before Nuxt;
- expose `/api/health` through a Docker health check;
- handle container termination gracefully;
- avoid embedding `.env.gcp`, OAuth secrets, database files, uploads, or backups in the image.

Docker Compose must use an explicit host bind mount:

```yaml
volumes:
  - /var/lib/dam:/var/lib/dam
```

The bind mount is preferred to an opaque Docker named volume because GCE snapshots, inspections, backups, and restores operate on a predictable host path. Compose must declare a single replica and a bounded memory allocation suitable for the selected VM, leaving capacity for the operating system and reverse proxy.

## Authentication

Standard Google sign-in requests only identity scopes:

- `openid`
- `email`
- `profile`

The Google Drive scope is requested only when a user explicitly enters the optional Drive connection flow. Local-storage organizations neither require nor automatically enter that flow.

Production secrets remain environment variables:

- `NUXT_OAUTH_GOOGLE_CLIENT_ID`
- `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`
- `NUXT_OAUTH_GOOGLE_REDIRECT_URL`
- session and super-administrator secrets already required by startup validation.

OAuth client secrets must never be committed, copied into images, printed by validation, or included in documentation examples as real values.

## Backups and Recovery

Backups cover both `/var/lib/dam/database.sqlite` and `/var/lib/dam/files`.

Required operational procedures:

- stop the application or use a SQLite-safe backup operation before copying the database;
- create a pre-upgrade archive on a separate filesystem or object-storage destination;
- configure scheduled GCE Persistent Disk snapshots;
- document restoration to a replacement disk and VM;
- verify a restored deployment by checking health, metadata visibility, and a file download.

A backup stored only on the same disk is not considered disaster recovery.

## Failure Handling

- Missing required environment values stop startup with names of missing settings but no secret values.
- An unwritable data root stops startup before migrations or HTTP serving.
- A failed migration stops startup; the application must not serve against a partially migrated database.
- A missing local file returns an explicit not-found response without deleting its metadata automatically.
- Optional Google Drive failures do not prevent local-storage organizations from loading or uploading assets.
- Health checks report application liveness without exposing configuration, paths, credentials, or user data.

## Security and Operations

- Run the container as a non-root user.
- Grant write access only to `/var/lib/dam`; keep application code read-only at runtime where practical.
- Publish port 8080 only to the reverse proxy or localhost after HTTPS is configured.
- Terminate public traffic over HTTPS.
- Keep production secrets in a root-readable environment file or GCP Secret Manager integration outside the image.
- Do not mount the Docker socket into the application container.
- Apply operating-system, Docker image, and dependency updates through reviewed rebuilds.
- Take a verified backup before upgrades or database migrations.

## Testing and Acceptance Criteria

Automated tests must demonstrate:

- a platform-storage organization resolves uploads to local storage;
- a Drive organization still resolves uploads to Drive;
- startup validation accepts the production local-storage settings and rejects missing persistence settings;
- data-path validation rejects unsafe or inconsistent paths;
- the Docker/Compose contract uses the host persistence path and one replica;
- ordinary Google sign-in does not require Drive state;
- existing permission, folder, nomenclature, upload, download, RAG, and Drive regression suites remain green.

Deployment acceptance requires:

1. Build the production Docker image successfully.
2. Start the container with `/var/lib/dam` bind-mounted from a persistent disk.
3. Receive HTTP 200 from `/api/health`.
4. Sign in with the company Google account without connecting Drive.
5. Confirm existing departments, permissions, nomenclature, and directory metadata remain visible.
6. Upload, preview, download, rename, and delete a local asset.
7. Recreate the container and confirm the database and uploaded asset persist.
8. Perform a backup and a test restore.
9. Confirm optional Drive-backed behavior remains covered by tests and was not removed.

## Rollback

Before cutover, retain the previous image, environment file, database backup, and disk snapshot. Rollback consists of stopping the new container, restoring the matching database and data snapshot if any write migrations occurred, restoring the previous environment configuration, and starting the previous image. Organization storage type changes must be reversed explicitly; rollback scripts must not infer or overwrite that value.
