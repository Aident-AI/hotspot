import { constants } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';

import { listSourceFiles, listTrackedFiles, resolveRepoFile } from './git.js';

export type SyncResult = {
  copied: number;
  removed: number;
  files: string[];
};

export type SyncOnceOptions = {
  sourceRoot: string;
  targetRoot: string;
  previousFiles?: string[];
};

export async function syncOnce(options: SyncOnceOptions): Promise<SyncResult> {
  const sourceFiles = await listSourceFiles(options.sourceRoot);
  const sourceSet = new Set(sourceFiles);
  const previousFiles = options.previousFiles ?? (await listTrackedFiles(options.targetRoot));

  let removed = 0;
  for (const relativePath of previousFiles) {
    if (!sourceSet.has(relativePath) && (await pathExists(resolveRepoFile(options.targetRoot, relativePath)))) {
      await rm(resolveRepoFile(options.targetRoot, relativePath), { force: true, recursive: true });
      await removeEmptyParents(options.targetRoot, path.dirname(relativePath));
      removed += 1;
    }
  }

  let copied = 0;
  for (const relativePath of sourceFiles) {
    const sourcePath = resolveRepoFile(options.sourceRoot, relativePath);
    const targetPath = resolveRepoFile(options.targetRoot, relativePath);

    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const stat = await lstat(sourcePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { force: true, recursive: true });

    if (stat.isSymbolicLink()) {
      await symlink(await readlink(sourcePath), targetPath);
      copied += 1;
    } else if (stat.isFile()) {
      await copyFile(sourcePath, targetPath, constants.COPYFILE_FICLONE);
      await chmod(targetPath, stat.mode & 0o777);
      copied += 1;
    }
  }

  return {
    copied,
    removed,
    files: sourceFiles,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeEmptyParents(root: string, relativeDir: string): Promise<void> {
  if (relativeDir === '.' || relativeDir === '') {
    return;
  }

  const dirPath = resolveRepoFile(root, relativeDir);
  try {
    await rm(dirPath, { recursive: false });
  } catch {
    return;
  }

  await removeEmptyParents(root, path.dirname(relativeDir));
}
