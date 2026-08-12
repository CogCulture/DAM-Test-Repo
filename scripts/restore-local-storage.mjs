import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { cp, mkdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isWithin = (parent, candidate) => {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
};

const exists = async (pathname) => {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const verifySqlite = (databasePath) => {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('quick_check');
    if (result.length !== 1 || result[0]?.quick_check !== 'ok') {
      throw new Error('SQLite backup integrity check failed.');
    }
  } finally {
    database.close();
  }
};

export const restoreLocalStorage = async ({ backupDirectory, dataRoot, confirmation }) => {
  if (confirmation !== 'RESTORE_STOPPED_DAM') {
    throw new Error('Restore requires confirmation RESTORE_STOPPED_DAM after the DAM service is stopped.');
  }

  const source = resolve(backupDirectory);
  const destination = resolve(dataRoot || '/var/lib/dam');
  if (isWithin(destination, source) || isWithin(source, destination)) {
    throw new Error('Backup directory and live data root must not overlap.');
  }

  const sourceDatabase = resolve(source, 'database.sqlite');
  const sourceFiles = resolve(source, 'files');
  await stat(sourceDatabase);
  await stat(sourceFiles);
  verifySqlite(sourceDatabase);

  await mkdir(destination, { recursive: true });
  const operationId = randomUUID();
  const stage = resolve(destination, `.restore-stage-${operationId}`);
  const rollbackDatabase = resolve(destination, `.restore-rollback-${operationId}.sqlite`);
  const rollbackFiles = resolve(destination, `.restore-rollback-${operationId}-files`);
  const rollbackWal = resolve(destination, `.restore-rollback-${operationId}.sqlite-wal`);
  const rollbackShm = resolve(destination, `.restore-rollback-${operationId}.sqlite-shm`);
  const liveDatabase = resolve(destination, 'database.sqlite');
  const liveFiles = resolve(destination, 'files');
  const liveWal = resolve(destination, 'database.sqlite-wal');
  const liveShm = resolve(destination, 'database.sqlite-shm');
  const moved = [];

  try {
    await mkdir(stage, { recursive: false });
    const stagedDatabase = resolve(stage, 'database.sqlite');
    const stagedFiles = resolve(stage, 'files');
    await cp(sourceDatabase, stagedDatabase, { errorOnExist: true });
    await cp(sourceFiles, stagedFiles, { recursive: true, errorOnExist: true });
    verifySqlite(stagedDatabase);

    for (const [livePath, rollbackPath] of [
      [liveDatabase, rollbackDatabase],
      [liveFiles, rollbackFiles],
      [liveWal, rollbackWal],
      [liveShm, rollbackShm],
    ]) {
      if (await exists(livePath)) {
        await rename(livePath, rollbackPath);
        moved.push([livePath, rollbackPath]);
      }
    }

    try {
      await rename(stagedDatabase, liveDatabase);
      await rename(stagedFiles, liveFiles);
    } catch (error) {
      await rm(liveDatabase, { force: true });
      await rm(liveFiles, { recursive: true, force: true });
      for (const [livePath, rollbackPath] of [...moved].reverse()) {
        if (await exists(rollbackPath)) await rename(rollbackPath, livePath);
      }
      throw error;
    }

    for (const [, rollbackPath] of moved) {
      await rm(rollbackPath, { recursive: true, force: true });
    }
    return { dataRoot: destination };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
};

const parseArguments = (argumentsList) => Object.fromEntries(
  argumentsList.flatMap((argument, index) => argument.startsWith('--')
    ? [[argument.slice(2), argumentsList[index + 1]]]
    : []),
);

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  const args = parseArguments(process.argv.slice(2));
  restoreLocalStorage({
    backupDirectory: args.backup,
    dataRoot: args['data-root'],
    confirmation: args.confirm,
  })
    .then(({ dataRoot }) => process.stdout.write(`DAM storage restored to ${dataRoot}\n`))
    .catch((error) => {
      process.stderr.write(`DAM restore failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
