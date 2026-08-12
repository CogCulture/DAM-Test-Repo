# Deploy the DAM on Google Compute Engine with persistent local storage

This production profile runs one Docker container on one Compute Engine VM. Google OAuth authenticates company users; uploaded bytes and SQLite metadata are stored on a separate GCE Persistent Disk mounted at `/var/lib/dam`.

```text
/var/lib/dam/
├── database.sqlite   # organizations, folders, departments, permissions, metadata
└── files/            # uploaded asset bytes
```

The VM's RAM runs the application and document-processing jobs. RAM is not used for durable storage. Keep exactly one application replica while this deployment uses SQLite and an attached filesystem.

## 1. Prepare Google Cloud and company login

1. Create or select a company-owned Google Cloud project with billing enabled.
2. Configure Google Auth Platform for the company. Use an **Internal** audience when every user belongs to the same Google Workspace organization.
3. Create an OAuth 2.0 Web application client.
4. Add `https://YOUR_DOMAIN/api/auth/google` as an exact authorized redirect URI.
5. Use the standard identity scopes (`openid`, `email`, and `profile`). The Drive API is not required for persistent local storage.

Keep `NUXT_PUBLIC_ENABLE_GDRIVE_STORAGE=false`. Optional legacy Drive hosting remains in the code and can be enabled later without being required by local-storage organizations.

## 2. Preview or create the VM and data disk

Install and authenticate the Google Cloud CLI on the administrator workstation. Preview the commands first:

```powershell
.\scripts\deploy-gce.ps1 -ProjectId YOUR_PROJECT_ID
```

Defaults:

- zone: `asia-south1-a`
- VM: `dam-portal`, `e2-standard-2`, Debian 12
- data disk: `dam-portal-data`, 100 GB, `pd-balanced`, automatic deletion disabled
- firewall: ports 80 and 443 only

Override disk size when needed:

```powershell
.\scripts\deploy-gce.ps1 -ProjectId YOUR_PROJECT_ID -DataDiskSizeGb 250
```

After reviewing the preview, execute it:

```powershell
.\scripts\deploy-gce.ps1 -ProjectId YOUR_PROJECT_ID -DataDiskSizeGb 250 -Execute
```

The script creates infrastructure and opens SSH. It never formats a disk, uploads source code, or handles credentials.

## 3. Format and mount a new blank disk

Run these commands over SSH. **Run `mkfs.ext4` only for a new empty disk. Formatting a disk that contains data destroys it.**

```bash
ls -l /dev/disk/by-id/google-*
sudo mkfs.ext4 -m 0 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-dam-portal-data
sudo mkdir -p /var/lib/dam
sudo mount -o discard,defaults /dev/disk/by-id/google-dam-portal-data /var/lib/dam
sudo chown -R 10001:10001 /var/lib/dam
sudo chmod 750 /var/lib/dam
```

Configure automatic mounting by UUID:

```bash
sudo cp /etc/fstab /etc/fstab.backup
sudo blkid /dev/disk/by-id/google-dam-portal-data
```

Add the returned UUID to `/etc/fstab`:

```text
UUID=YOUR_DISK_UUID /var/lib/dam ext4 discard,defaults,nofail 0 2
```

Verify before continuing:

```bash
sudo umount /var/lib/dam
sudo mount -a
findmnt /var/lib/dam
sudo -u '#10001' sh -c 'touch /var/lib/dam/.write-test && rm /var/lib/dam/.write-test'
```

Google recommends using a persistent device identifier or filesystem UUID because Linux device names can change after reboot. See [formatting and mounting a non-boot disk](https://cloud.google.com/compute/docs/disks/format-mount-disk-linux).

## 4. Install Docker and place the application

Install Docker Engine and the Compose plugin using Docker's Debian instructions. Verify:

```bash
docker --version
docker compose version
```

Clone or securely copy this repository to `/opt/dam`, then enter that directory.

## 5. Configure production secrets

```bash
cp .env.gcp.example .env.gcp
chmod 600 .env.gcp
nano .env.gcp
```

Required storage values are already set correctly in the example:

```dotenv
DATABASE_PATH=/var/lib/dam/database.sqlite
LOCAL_DAM_STORAGE_DIR=/var/lib/dam/files
NUXT_PUBLIC_ENABLE_GDRIVE_STORAGE=false
```

Set the public HTTPS origin and callback:

```dotenv
NUXT_PUBLIC_SITE_URL=https://dam.example.com
NUXT_OAUTH_GOOGLE_REDIRECT_URL=https://dam.example.com/api/auth/google
```

Enter the company OAuth client ID/secret and application administrator credentials. Generate independent session secrets with at least 32 characters:

```bash
openssl rand -base64 48
```

Never commit `.env.gcp`, paste it into support messages, or bake it into the Docker image.

## 6. Preserve existing metadata and start with empty asset bytes

If an existing SQLite database contains the folder structure and organization configuration, stop its old application before copying it:

```bash
sudo install -o 10001 -g 10001 -m 640 /secure/source/database.sqlite /var/lib/dam/database.sqlite
sudo install -d -o 10001 -g 10001 -m 750 /var/lib/dam/files
```

Do not copy Google Drive file bytes. Historical Drive rows remain metadata; the new local asset directory starts empty.

The application never changes an organization's storage type automatically. After taking a disk snapshot or external backup, explicitly switch the intended organization:

```bash
sudo mkdir -p /var/backups/dam
docker compose -f docker-compose.gcp.yml run --rm \
  -v /var/backups/dam:/backup \
  dam pnpm storage:set -- \
  --organization YOUR_ORGANIZATION_ID \
  --target local \
  --database /var/lib/dam/database.sqlite \
  --backup-directory /backup
```

This command creates a SQLite backup before changing only `organizations.org_type` from `gdrive` to the existing platform-storage value `s3`. It does not delete Drive connections, folders, departments, file rows, permissions, nomenclature, taxonomies, or settings.

For a new installation, skip the copy and cutover. Startup creates the database and empty asset directory.

## 7. Build and start

```bash
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d
docker compose -f docker-compose.gcp.yml ps
curl --fail http://127.0.0.1:8080/api/health
```

Startup performs these operations in order:

1. validates required environment variables;
2. validates absolute database and asset paths;
3. creates missing directories and verifies the asset directory is writable;
4. applies idempotent SQLite migrations;
5. starts Nuxt on port 8080.

The container runs as UID/GID `10001`, has a 6 GB memory limit, and receives 30 seconds for graceful shutdown. Compose binds port 8080 only to `127.0.0.1`.

## 8. Configure HTTPS

Point the production domain to the VM's static external IP. Install a host reverse proxy such as Caddy or use a Google Cloud HTTPS Load Balancer. Proxy HTTPS traffic to `http://127.0.0.1:8080`.

Only ports 80 and 443 are public. Do not add a public firewall rule for port 8080.

## 9. Acceptance test

1. Sign in with a company Google account without connecting Google Drive.
2. Confirm organizations, departments, permissions, nomenclature, taxonomy, and folders are present.
3. Upload a new asset and verify it appears beneath `/var/lib/dam/files`.
4. Preview, download, rename, and delete a test asset.
5. Recreate the container and verify state persists:

```bash
docker compose -f docker-compose.gcp.yml up -d --force-recreate
curl --fail http://127.0.0.1:8080/api/health
```

6. Confirm the test file and directory metadata are still available.

## 10. Backup and restore

Store backups outside `/var/lib/dam`. Stop writes for a consistent database-and-files checkpoint:

```bash
docker compose -f docker-compose.gcp.yml stop dam
node scripts/backup-local-storage.mjs \
  --data-root /var/lib/dam \
  --destination /var/backups/dam
docker compose -f docker-compose.gcp.yml start dam
```

Copy completed backups to a different disk or object-storage destination. A backup on the same data disk is not disaster recovery.

Restore only while the service is stopped:

```bash
docker compose -f docker-compose.gcp.yml stop dam
node scripts/restore-local-storage.mjs \
  --backup /var/backups/dam/dam-backup-TIMESTAMP \
  --data-root /var/lib/dam \
  --confirm RESTORE_STOPPED_DAM
sudo chown -R 10001:10001 /var/lib/dam
docker compose -f docker-compose.gcp.yml start dam
curl --fail http://127.0.0.1:8080/api/health
```

Also configure scheduled GCE Persistent Disk snapshots with retention appropriate for the company. Test a restore to a replacement disk and VM before relying on the policy.

## Upgrade and rollback

Before every upgrade:

1. create and verify an external backup;
2. create a disk snapshot;
3. retain the previous image tag and `.env.gcp`;
4. pull the reviewed release and rebuild;
5. check health and the acceptance workflow.

```bash
git pull --ff-only
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d
curl --fail http://127.0.0.1:8080/api/health
```

Rollback by stopping the service, restoring the matching data snapshot/backup if migrations wrote to the database, restoring the previous environment configuration, and starting the previous image. Reverse organization storage changes only through the explicit `storage:set` command.

## Operational limits

- Keep one application replica while using SQLite and a directly attached disk.
- Use GCE Persistent Disk, not RAM or Local SSD, for durable assets.
- The 6 GB container limit assumes an 8 GB VM; use a larger VM for concurrent RAG jobs.
- Expand Persistent Disk capacity independently as the asset library grows.
- Move to a network database and shared object/file storage before horizontal scaling.
