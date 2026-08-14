import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SAFE_ARGUMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const requireSafe = (name, value) => {
  if (!SAFE_ARGUMENT.test(String(value || ''))) {
    throw new Error(`${name} contains unsupported characters.`);
  }
  return String(value);
};

export const buildGceDeploymentSteps = ({
  projectId,
  zone = 'asia-south1-a',
  vmName = 'dam-portal',
  machineType = 'e2-standard-2',
  dataDiskName = 'dam-portal-data',
  dataDiskSizeGb = 100,
} = {}) => {
  const project = requireSafe('Project ID', projectId);
  const safeZone = requireSafe('Zone', zone);
  const safeVmName = requireSafe('VM name', vmName);
  const safeMachineType = requireSafe('Machine type', machineType);
  const safeDiskName = requireSafe('Data disk name', dataDiskName);
  const diskSize = Number(dataDiskSizeGb);
  if (!Number.isInteger(diskSize) || diskSize < 10) throw new Error('Data disk size must be an integer of at least 10 GB.');

  return [
    ['config', 'set', 'project', project],
    ['services', 'enable', 'compute.googleapis.com'],
    ['compute', 'disks', 'create', safeDiskName, `--zone=${safeZone}`, '--type=pd-balanced', `--size=${diskSize}GB`],
    [
      'compute', 'instances', 'create', safeVmName,
      `--zone=${safeZone}`,
      `--machine-type=${safeMachineType}`,
      '--boot-disk-size=30GB',
      '--image-family=debian-12',
      '--image-project=debian-cloud',
      '--tags=dam-web',
      `--disk=name=${safeDiskName},device-name=${safeDiskName},mode=rw,boot=no,auto-delete=no`,
    ],
    [
      'compute', 'firewall-rules', 'create', 'dam-allow-web',
      '--allow=tcp:80,tcp:443',
      '--target-tags=dam-web',
      '--description=DAM HTTPS traffic',
    ],
    ['compute', 'ssh', safeVmName, `--zone=${safeZone}`],
  ];
};

export const buildGceDeploymentCommands = (options) =>
  buildGceDeploymentSteps(options).map((argumentsList) => `gcloud ${argumentsList.join(' ')}`);

const parseArguments = (argumentsList) => {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--execute') {
      values.execute = true;
      continue;
    }
    if (!argument.startsWith('--')) continue;
    values[argument.slice(2)] = argumentsList[index + 1];
    index += 1;
  }
  return values;
};

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const options = {
      projectId: args['project-id'],
      zone: args.zone,
      vmName: args['vm-name'],
      machineType: args['machine-type'],
      dataDiskName: args['data-disk-name'],
      dataDiskSizeGb: args['data-disk-size-gb'],
    };
    const steps = buildGceDeploymentSteps(options);

    if (!args.execute) {
      process.stdout.write('Plan only. Re-run with -Execute after reviewing these commands:\n');
      process.stdout.write(`${buildGceDeploymentCommands(options).join('\n')}\n`);
    } else {
      for (const argumentsList of steps) {
        process.stdout.write(`> gcloud ${argumentsList.join(' ')}\n`);
        const result = spawnSync('gcloud', argumentsList, { stdio: 'inherit', shell: false });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`gcloud exited with status ${result.status}.`);
      }
      process.stdout.write('VM and persistent disk created. Follow docs/GCP_DEPLOYMENT.md to mount the disk and start Docker.\n');
    }
  } catch (error) {
    process.stderr.write(`GCE deployment failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
