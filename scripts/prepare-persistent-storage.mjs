import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const validatePersistentStoragePaths = ({ databasePath, storageDirectory }) => {
  const errors = [];
  const database = String(databasePath || '').trim();
  const storage = String(storageDirectory || '').trim();

  if (database && !isAbsolute(database)) errors.push('DATABASE_PATH must be absolute.');
  if (storage && !isAbsolute(storage)) errors.push('LOCAL_DAM_STORAGE_DIR must be absolute.');
  if (database && storage && isAbsolute(database) && isAbsolute(storage) && resolve(database) === resolve(storage)) {
    errors.push('DATABASE_PATH and LOCAL_DAM_STORAGE_DIR must be different paths.');
  }

  return errors;
};

export const preparePersistentStorage = async ({ databasePath, storageDirectory }) => {
  const errors = validatePersistentStoragePaths({ databasePath, storageDirectory });
  if (errors.length) throw new Error(errors.join(' '));

  const resolvedDatabasePath = resolve(databasePath);
  const resolvedStorageDirectory = resolve(storageDirectory);
  await mkdir(dirname(resolvedDatabasePath), { recursive: true });
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
