import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const createGcpBuildEnvironment = (environment = process.env) => ({
  ...environment,
  NITRO_PRESET: 'node-server',
});

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  const nuxtCli = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url));
  const child = spawn(process.execPath, [nuxtCli, 'build', '--preset', 'node-server'], {
    env: createGcpBuildEnvironment(),
    stdio: 'inherit',
    shell: false,
  });
  child.once('error', (error) => {
    process.stderr.write(`GCP build failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    if (signal) {
      process.stderr.write(`GCP build stopped by signal ${signal}.\n`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}
