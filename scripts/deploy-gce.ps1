param(
  [Parameter(Mandatory = $true)] [string] $ProjectId,
  [string] $Zone = "asia-south1-a",
  [string] $VmName = "dam-portal",
  [string] $MachineType = "e2-standard-2",
  [string] $DataDiskName = "dam-portal-data",
  [ValidateRange(10, 65536)] [int] $DataDiskSizeGb = 100,
  [switch] $Execute
)

$ErrorActionPreference = "Stop"
$arguments = @(
  "scripts/gce-deployment-plan.mjs",
  "--project-id", $ProjectId,
  "--zone", $Zone,
  "--vm-name", $VmName,
  "--machine-type", $MachineType,
  "--data-disk-name", $DataDiskName,
  "--data-disk-size-gb", "$DataDiskSizeGb"
)
if ($Execute) { $arguments += "--execute" }

& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Deployment planner failed with exit code $LASTEXITCODE" }
