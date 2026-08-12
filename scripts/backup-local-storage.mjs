import Database from 'better-sqlite3';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const isWithin = (parent, candidate) => {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
};

export const backupLocalStorage = async ({ dataRoot, destinationRoot }) => {
  const sourceRoot = resolve(dataRoot || '/var/lib/dam');
  const destination = resolve(destinationRoot || 'backups');
  if (isWithin(sourceRoot, destination)) {
    throw new Error('Backup destination must be outside the live data root.');
  }

  const databasePath = resolve(sourceRoot, 'database.sqlite');
  const filesPath = resolve(sourceRoot, 'files');
  await stat(databasePath);
  await stat(filesPath);
  await mkdir(destination, { recursive: true });
  const backupDirectory = resolve(destination, `dam-backup-${timestamp()}`);
  await mkdir(backupDirectory, { recursive: false });

  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await sqlite.backup(resolve(backupDirectory, 'database.sqlite'));
    await cp(filesPath, resolve(backupDirectory, 'files'), { recursive: true, errorOnExist: true });
    await writeFile(resolve(backupDirectory, 'manifest.json'), JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      contents: ['database.sqlite', 'files'],
    }, null, 2));
    return { backupDirectory };
  } catch (error) {
    await rm(backupDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    sqlite.close();
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
  backupLocalStorage({ dataRoot: args['data-root'], destinationRoot: args.destination })
    .then(({ backupDirectory }) => process.stdout.write(`DAM backup created at ${backupDirectory}\n`))
    .catch((error) => {
      process.stderr.write(`DAM backup failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
