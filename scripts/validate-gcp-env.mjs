import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_GCP_ENVIRONMENT = [
  'DAM_DATA_ROOT',
  'LOCAL_DAM_STORAGE_DIR',
  'NUXT_PUBLIC_SITE_URL',
  'NUXT_SESSION_PASSWORD',
  'NUXT_OAUTH_GOOGLE_CLIENT_ID',
  'NUXT_OAUTH_GOOGLE_CLIENT_SECRET',
  'NUXT_OAUTH_GOOGLE_REDIRECT_URL',
  'SUPERADMIN_EMAIL',
  'SUPERADMIN_PASSWORD',
  'SUPERADMIN_SESSION_PASSWORD',
];

export const validateGcpEnvironment = (environment) => {
  const missing = REQUIRED_GCP_ENVIRONMENT.filter((name) => !String(environment[name] || '').trim());
  if (!environment.DATABASE_URL && !environment.DATABASE_PATH) {
    missing.push('DATABASE_URL or DATABASE_PATH');
  }
  return missing;
};

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  const missing = validateGcpEnvironment(process.env);
  const shortSecrets = [
    'NUXT_SESSION_PASSWORD',
    'SUPERADMIN_SESSION_PASSWORD',
  ].filter((name) => String(process.env[name] || '').length < 32);

  if (missing.length || shortSecrets.length) {
    if (missing.length) process.stderr.write(`Missing required GCP settings: ${missing.join(', ')}\n`);
    if (shortSecrets.length) process.stderr.write(`Secrets must contain at least 32 characters: ${shortSecrets.join(', ')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('GCP environment validation passed.\n');
  }
}
