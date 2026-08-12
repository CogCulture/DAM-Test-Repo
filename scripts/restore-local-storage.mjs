import Database from 'better-sqlite3';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const restoreLocalStorage = async ({ backupDirectory, dataRoot, confirmation }) => {
  if (confirmation !== 'RESTORE_STOPPED_DAM') {
    throw new Error('Restore requires confirmation RESTORE_STOPPED_DAM after the DAM service is stopped.');
  }

  const source = resolve(backupDirectory);
  const destination = resolve(dataRoot || '/var/lib/dam');
  const sourceDatabase = resolve(source, 'database.sqlite');
  const sourceFiles = resolve(source, 'files');
  await stat(sourceDatabase);
  await stat(sourceFiles);

  const verificationDatabase = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
  try {
    verificationDatabase.pragma('quick_check');
  } finally {
    verificationDatabase.close();
  }

  await mkdir(destination, { recursive: true });
  await rm(resolve(destination, 'database.sqlite'), { force: true });
  await rm(resolve(destination, 'database.sqlite-shm'), { force: true });
  await rm(resolve(destination, 'database.sqlite-wal'), { force: true });
  await rm(resolve(destination, 'files'), { recursive: true, force: true });
  await cp(sourceDatabase, resolve(destination, 'database.sqlite'), { errorOnExist: true });
  await cp(sourceFiles, resolve(destination, 'files'), { recursive: true, errorOnExist: true });

  return { dataRoot: destination };
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
