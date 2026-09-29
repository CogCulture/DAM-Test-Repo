import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoverInterruptedRestore } from './restore-local-storage.mjs';

export const validatePersistentStoragePaths = ({
  dataRoot,
  databasePath,
  storageDirectory,
  expectedDataRoot = '/var/lib/dam',
}) => {
  const errors = [];
  const root = String(dataRoot || '').trim();
  const database = String(databasePath || '').trim();
  const storage = String(storageDirectory || '').trim();

  if (root && !isAbsolute(root)) errors.push('DAM_DATA_ROOT must be absolute.');
  if (database && !isAbsolute(database)) errors.push('DATABASE_PATH must be absolute.');
  if (storage && !isAbsolute(storage)) errors.push('LOCAL_DAM_STORAGE_DIR must be absolute.');
  if (errors.length) return errors;

  if (root && resolve(root) !== resolve(expectedDataRoot)) {
    errors.push(`DAM_DATA_ROOT must equal ${expectedDataRoot} in production.`);
  }

  if (root && database) {
    const expectedDatabase = resolve(root, 'database.sqlite');
    if (resolve(database) !== expectedDatabase) errors.push('DATABASE_PATH must equal <DAM_DATA_ROOT>/database.sqlite.');
  }
  if (root && storage) {
    const expectedStorage = resolve(root, 'files');
    if (resolve(storage) !== expectedStorage) errors.push('LOCAL_DAM_STORAGE_DIR must equal <DAM_DATA_ROOT>/files.');
  }

  return errors;
};

export const preparePersistentStorage = async ({
  dataRoot,
  databasePath,
  storageDirectory,
  expectedDataRoot = '/var/lib/dam',
}) => {
  const errors = validatePersistentStoragePaths({
    dataRoot,
    databasePath,
    storageDirectory,
    expectedDataRoot,
  });
  if (errors.length) throw new Error(errors.join(' '));

  const resolvedDatabasePath = databasePath ? resolve(databasePath) : null;
  const resolvedStorageDirectory = resolve(storageDirectory);
  await mkdir(resolve(dataRoot), { recursive: true });
  await recoverInterruptedRestore({ dataRoot });
  if (resolvedDatabasePath) {
    await mkdir(dirname(resolvedDatabasePath), { recursive: true });
  }
  await mkdir(resolvedStorageDirectory, { recursive: true });

  const probePath = resolve(resolvedStorageDirectory, `.dam-write-probe-${randomUUID()}`);
  try {
    await writeFile(probePath, 'ok', { flag: 'wx' });
  } finally {
    await rm(probePath, { force: true });
  }

  return {
    databasePath: resolvedDatabasePath,
    storageDirectory: resolvedStorageDirectory,
  };
};

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  preparePersistentStorage({
    dataRoot: process.env.DAM_DATA_ROOT,
    databasePath: process.env.DATABASE_PATH,
    storageDirectory: process.env.LOCAL_DAM_STORAGE_DIR,
  })
    .then(({ databasePath, storageDirectory }) => {
      process.stdout.write(`Persistent storage ready: database=${databasePath}, files=${storageDirectory}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Persistent storage preparation failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
