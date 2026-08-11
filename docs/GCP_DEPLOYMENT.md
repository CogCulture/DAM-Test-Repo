# Deploy the DAM portal on Google Compute Engine

This deployment keeps the application and metadata on GCP and stores document bytes in the Google Drive folder connected by the organization administrator. It intentionally runs one application instance because the metadata database is SQLite.

## 1. Prepare Google Cloud

In Google Cloud Console:

1. Create or select a project with billing enabled.
2. Enable the Compute Engine API and Google Drive API.
3. Create an OAuth 2.0 Web application credential under **APIs & Services → Credentials**.
4. Add `https://YOUR_DOMAIN/api/auth/google` as an authorized redirect URI.
5. Configure the OAuth consent screen and add the required users while the application remains in testing mode.

Google references: [Create a Compute Engine VM](https://cloud.google.com/compute/docs/instances/create-start-instance), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), and [Google Drive API overview](https://developers.google.com/drive/api/guides/about-sdk).

## 2. Create the VM

Recommended minimum for light use and RAG testing:

- Debian 12
- `e2-standard-2` (2 vCPU, 8 GB RAM)
- 30 GB balanced persistent boot disk
- static external IP
- firewall access on ports 80 and 443

Preview the provided commands without changing GCP:

```powershell
.\scripts\deploy-gce.ps1 -ProjectId YOUR_PROJECT_ID
```

Only after reviewing them, create the VM:

```powershell
.\scripts\deploy-gce.ps1 -ProjectId YOUR_PROJECT_ID -Execute
```

The script creates infrastructure only. It does not upload source code, credentials, or start the application.

## 3. Install Docker on the VM

SSH into the VM and follow Docker's official Debian installation instructions. Verify:

```bash
docker --version
docker compose version
```

Clone or securely copy this repository to `/opt/dam`, then enter that directory.

## 4. Configure production secrets

```bash
cp .env.gcp.example .env.gcp
chmod 600 .env.gcp
nano .env.gcp
```

Replace every required blank value. Generate independent session secrets:

```bash
openssl rand -base64 48
```

Set all three URL values to the final HTTPS domain:

```dotenv
NUXT_PUBLIC_SITE_URL=https://dam.example.com
NUXT_OAUTH_GOOGLE_REDIRECT_URL=https://dam.example.com/api/auth/google
```

Do not place `.env.gcp` in the Docker image, Git, shell history, screenshots, or support messages.

## 5. Build and start

```bash
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d
docker compose -f docker-compose.gcp.yml ps
curl --fail http://127.0.0.1:8080/api/health
```

Startup validates required settings, creates `/var/lib/dam/database.sqlite`, and applies every unapplied migration before starting Nuxt.

## 6. Configure HTTPS

Google OAuth web callbacks require the public HTTPS origin configured in Google Cloud Console. Point the domain's DNS record to the VM's static external IP, then place an HTTPS reverse proxy such as Caddy or an external Google Cloud HTTPS Load Balancer in front of port 8080.

Do not expose port 8080 publicly after HTTPS is working. Restrict it to the reverse proxy or localhost and keep only ports 80/443 open.

## 7. Connect Google Drive storage

1. Sign in through Google.
2. Create or approve the organization through Super Admin.
3. Choose Google Drive as the organization storage type.
4. Connect the organization administrator's Google account.
5. Select the approved Drive root folder.
6. Confirm the connection request where required.
7. Upload a test document through **Asset actions** and verify that the document appears in the selected Drive folder.

The SQLite database stores permissions, approval records, naming rules, hashes and Drive identifiers. Document bytes remain in Google Drive.

## 8. Verify the five features

- Configure nomenclature and extensions under `/admin/nomenclature`, then test an accepted and rejected upload.
- Submit a folder request as a lower-level user and approve it under `/admin/folder-requests`.
- Configure role and user access under `/admin/access-control`.
- Import a public file URL through **Asset actions** and confirm the resulting document in Drive.
- Upload byte-identical content twice and confirm the second DAM/Drive name uses `filename (1).ext`.

## Backup and upgrade

Back up metadata while the application is stopped:

```bash
docker compose -f docker-compose.gcp.yml stop dam
docker run --rm -v damself_dam_data:/data -v "$PWD/backups:/backup" debian:12-slim sh -c 'cp /data/database.sqlite /backup/database-$(date +%Y%m%d-%H%M%S).sqlite'
docker compose -f docker-compose.gcp.yml start dam
```

Upgrade only after a backup:

```bash
git pull --ff-only
docker compose -f docker-compose.gcp.yml build
docker compose -f docker-compose.gcp.yml up -d
curl --fail http://127.0.0.1:8080/api/health
```

Rollback by checking out the previous release, rebuilding the image, and restoring the matching database backup while the service is stopped.

## Operational limits

- Keep Compose at one replica while using SQLite.
- Use a persistent Docker volume or explicitly bind-mount the VM persistent disk.
- Back up before every application or migration upgrade.
- Increase VM CPU/RAM for concurrent document parsing.
- Migrate metadata to Cloud SQL before adding multiple application instances.
