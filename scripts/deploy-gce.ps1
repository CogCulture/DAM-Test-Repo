param(
  [Parameter(Mandatory = $true)] [string] $ProjectId,
  [string] $Zone = "asia-south1-a",
  [string] $VmName = "dam-portal",
  [string] $MachineType = "e2-standard-2",
  [switch] $Execute
)

$ErrorActionPreference = "Stop"
$commands = @(
  "gcloud config set project $ProjectId",
  "gcloud services enable compute.googleapis.com drive.googleapis.com",
  "gcloud compute instances create $VmName --zone=$Zone --machine-type=$MachineType --boot-disk-size=30GB --image-family=debian-12 --image-project=debian-cloud --tags=dam-web",
  "gcloud compute firewall-rules create dam-allow-web --allow=tcp:80,tcp:443,tcp:8080 --target-tags=dam-web --description=`"DAM web traffic`"",
  "gcloud compute ssh $VmName --zone=$Zone"
)

if (-not $Execute) {
  Write-Host "Plan only. Re-run with -Execute after reviewing these commands:"
  $commands | ForEach-Object { Write-Host $_ }
  exit 0
}

foreach ($command in $commands) {
  Write-Host "> $command"
  & cmd.exe /d /c $command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

Write-Host "VM created. Follow docs/GCP_DEPLOYMENT.md to install Docker, copy .env.gcp, start the container, and configure HTTPS."
