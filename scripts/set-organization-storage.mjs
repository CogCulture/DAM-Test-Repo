import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_TYPES = {
  local: 's3',
  gdrive: 'gdrive',
};

const safeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export const setOrganizationStorage = async ({
  databasePath,
  organizationId,
  target,
  backupDirectory,
}) => {
  if (!databasePath) throw new Error('DATABASE_PATH is required.');
  if (!organizationId) throw new Error('An organization ID is required.');
  if (!(target in TARGET_TYPES)) throw new Error('Storage target must be "local" or "gdrive".');

  const resolvedDatabasePath = resolve(databasePath);
  const resolvedBackupDirectory = backupDirectory
    ? resolve(backupDirectory)
    : resolve(dirname(resolvedDatabasePath), 'backups');
  const sqlite = new Database(resolvedDatabasePath);

  try {
    const organization = sqlite
      .prepare('SELECT id, org_type AS orgType FROM organizations WHERE id = ?')
      .get(organizationId);
    if (!organization) throw new Error(`Organization "${organizationId}" was not found.`);

    await mkdir(resolvedBackupDirectory, { recursive: true });
    const backupPath = resolve(
      resolvedBackupDirectory,
      `${basename(resolvedDatabasePath)}.${organizationId}.${safeTimestamp()}.bak`,
    );
    await sqlite.backup(backupPath);

    const nextType = TARGET_TYPES[target];
    sqlite.transaction(() => {
      sqlite.prepare('UPDATE organizations SET org_type = ? WHERE id = ?').run(nextType, organizationId);
    })();

    return {
      organizationId,
      previousType: organization.orgType,
      nextType,
      backupPath,
    };
  } finally {
    sqlite.close();
  }
};

const parseArguments = (argumentsList) => {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith('--')) continue;
    values[argument.slice(2)] = argumentsList[index + 1];
    index += 1;
  }
  return values;
};

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  const args = parseArguments(process.argv.slice(2));
  setOrganizationStorage({
    databasePath: args.database || process.env.DATABASE_PATH,
    organizationId: args.organization,
    target: args.target,
    backupDirectory: args['backup-directory'],
  })
    .then((result) => {
      process.stdout.write(
        `Organization ${result.organizationId} storage changed from ${result.previousType} to ${result.nextType}. Backup: ${result.backupPath}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`Storage cutover failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
