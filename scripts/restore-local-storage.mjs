import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { cp, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
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

const recoveryPaths = (destination, operationId) => ({
  manifest: resolve(destination, '.restore-recovery.json'),
  stage: resolve(destination, `.restore-stage-${operationId}`),
  entries: [
    {
      key: 'database',
      live: resolve(destination, 'database.sqlite'),
      rollback: resolve(destination, `.restore-rollback-${operationId}.sqlite`),
      recursive: false,
    },
    {
      key: 'files',
      live: resolve(destination, 'files'),
      rollback: resolve(destination, `.restore-rollback-${operationId}-files`),
      recursive: true,
    },
    {
      key: 'wal',
      live: resolve(destination, 'database.sqlite-wal'),
      rollback: resolve(destination, `.restore-rollback-${operationId}.sqlite-wal`),
      recursive: false,
    },
    {
      key: 'shm',
      live: resolve(destination, 'database.sqlite-shm'),
      rollback: resolve(destination, `.restore-rollback-${operationId}.sqlite-shm`),
      recursive: false,
    },
  ],
});

const syncDirectory = async (directory) => {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const writeRecoveryManifest = async ({ pathname, temporaryPath, value, renamePath }) => {
  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await renamePath(temporaryPath, pathname);
  await syncDirectory(resolve(pathname, '..'));
};

export const recoverInterruptedRestore = async ({ dataRoot, renamePath = rename }) => {
  const destination = resolve(dataRoot || '/var/lib/dam');
  const manifestPath = resolve(destination, '.restore-recovery.json');
  if (!await exists(manifestPath)) return false;

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.version !== 1 || !/^[0-9a-f-]{36}$/i.test(manifest?.operationId || '')) {
    throw new Error('Restore recovery manifest is invalid; manual recovery is required.');
  }

  const paths = recoveryPaths(destination, manifest.operationId);
  for (const entry of [...paths.entries].reverse()) {
    if (await exists(entry.rollback)) {
      await rm(entry.live, { recursive: entry.recursive, force: true });
      await renamePath(entry.rollback, entry.live);
    } else if (manifest.hadLive?.[entry.key] === false) {
      await rm(entry.live, { recursive: entry.recursive, force: true });
    }
  }
  await rm(paths.stage, { recursive: true, force: true });
  await rm(paths.manifest, { force: true });
  await syncDirectory(destination);
  return true;
};

export const restoreLocalStorage = async ({
  backupDirectory,
  dataRoot,
  confirmation,
  renamePath = rename,
}) => {
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
  await recoverInterruptedRestore({ dataRoot: destination, renamePath });
  const operationId = randomUUID();
  const paths = recoveryPaths(destination, operationId);
  const stage = paths.stage;
  const manifestTemp = `${paths.manifest}.${operationId}.tmp`;
  const liveDatabase = resolve(destination, 'database.sqlite');
  const liveFiles = resolve(destination, 'files');

  try {
    await mkdir(stage, { recursive: false });
    const stagedDatabase = resolve(stage, 'database.sqlite');
    const stagedFiles = resolve(stage, 'files');
    await cp(sourceDatabase, stagedDatabase, { errorOnExist: true });
    await cp(sourceFiles, stagedFiles, { recursive: true, errorOnExist: true });
    verifySqlite(stagedDatabase);

    const hadLive = Object.fromEntries(await Promise.all(paths.entries.map(async (entry) => [
      entry.key,
      await exists(entry.live),
    ])));
    await writeRecoveryManifest({
      pathname: paths.manifest,
      temporaryPath: manifestTemp,
      value: { version: 1, operationId, hadLive },
      renamePath,
    });

    try {
      for (const entry of paths.entries) {
        if (hadLive[entry.key]) await renamePath(entry.live, entry.rollback);
      }

      await renamePath(stagedDatabase, liveDatabase);
      await renamePath(stagedFiles, liveFiles);
    } catch (error) {
      await recoverInterruptedRestore({ dataRoot: destination, renamePath });
      throw error;
    }

    await rm(paths.manifest, { force: true });
    await syncDirectory(destination);
    for (const entry of paths.entries) {
      await rm(entry.rollback, { recursive: entry.recursive, force: true });
    }
    return { dataRoot: destination };
  } finally {
    await rm(manifestTemp, { force: true });
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
