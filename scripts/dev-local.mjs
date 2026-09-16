import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { rmSync, existsSync, readFileSync } from 'node:fs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

process.env.HOME = resolve(projectRoot, '.data');
process.env.USERPROFILE = resolve(projectRoot, '.data');

function loadDotEnv(fileName) {
  const filePath = resolve(projectRoot, fileName);
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv('.env');
loadDotEnv('.env.local');

// Pre-clean .output to avoid Windows EPERM file-lock errors on better-sqlite3 binary
const outputDir = resolve(projectRoot, '.output');
if (existsSync(outputDir)) {
  try {
    rmSync(outputDir, { recursive: true, force: true });
    console.log('[dev-local] Cleaned .output directory');
  } catch (e) {
    console.warn('[dev-local] Could not clean .output (may be locked):', e.message);
    console.warn('[dev-local] Close other Node/Nuxt windows, then run: taskkill /F /IM node.exe');
  }
}

const nuxtCli = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url));

const superAdminEmail = process.env.SUPERADMIN_EMAIL || "superadmin@dam.local";
const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@12345";
const superAdminSessionPassword =
  process.env.SUPERADMIN_SESSION_PASSWORD || "local-superadmin-session-password-32";

console.log('[dev-local] Super Admin portal: http://localhost:3000/superadmin/login');
console.log(`[dev-local] Super Admin email: ${superAdminEmail}`);

const child = spawn(process.execPath, [nuxtCli, "dev", "--host", "0.0.0.0"], {
  env: {
    ...process.env,
    HOME: resolve(projectRoot, '.data'),
    USERPROFILE: resolve(projectRoot, '.data'),
    NITRO_PRESET: "node-server",
    DATABASE_PATH: "./data/sqlite.db",
    SUPERADMIN_EMAIL: superAdminEmail,
    SUPERADMIN_PASSWORD: superAdminPassword,
    SUPERADMIN_SESSION_PASSWORD: superAdminSessionPassword,
  },
  stdio: "inherit",
  shell: false,
});

child.once('error', (error) => {
  process.stderr.write(`Dev server failed to start: ${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`Dev server stopped by signal ${signal}.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});

