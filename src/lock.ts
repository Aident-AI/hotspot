import crypto from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';

import { getCommonGitDir, getRepoRoot } from './git.js';

export type LockOwner = {
  hostname: string;
  pid: number;
  sourceRoot: string;
  targetRoot: string;
  startedAt: string;
  updatedAt: string;
  token: string;
};

export type ActiveLock = {
  lockDir: string;
  manifestPath: string;
  owner: LockOwner;
  heartbeat: () => Promise<void>;
  isStopRequested: () => Promise<boolean>;
  readManifest: () => Promise<string[]>;
  release: () => Promise<void>;
  stillOwnsLock: () => Promise<boolean>;
  writeManifest: (files: string[]) => Promise<void>;
};

type AcquireOptions = {
  source: string;
  target: string;
  replace?: boolean;
};

const lockDirectoryName = 'active.lock';
const ownerFileName = 'owner.json';
const manifestFileName = 'manifest.json';
const stopFileName = 'stop';

export async function acquireActiveLock(options: AcquireOptions): Promise<ActiveLock> {
  const sourceRoot = await getRepoRoot(options.source);
  const targetRoot = await getRepoRoot(options.target);
  const lockRoot = await getLockRoot(targetRoot);
  const lockDir = path.join(lockRoot, lockDirectoryName);

  await mkdir(lockRoot, { recursive: true });

  for (;;) {
    try {
      await mkdir(lockDir);
      return createActiveLock(lockDir, sourceRoot, targetRoot);
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) {
        throw error;
      }

      const owner = await readOwner(lockDir);
      if (!owner || !processIsAlive(owner.pid)) {
        await rm(lockDir, { force: true, recursive: true });
        continue;
      }

      if (options.replace) {
        await requestStop(lockDir);
        await waitForUnlock(lockDir, 10_000);
        continue;
      }

      throw new Error(
        `Another hotspot sync is active for ${targetRoot}: pid ${owner.pid}, source ${owner.sourceRoot}`,
      );
    }
  }
}

export async function readActiveStatus(target: string): Promise<LockOwner | null> {
  const targetRoot = await getRepoRoot(target);
  const lockDir = path.join(await getLockRoot(targetRoot), lockDirectoryName);
  const owner = await readOwner(lockDir);

  if (!owner) {
    return null;
  }

  return processIsAlive(owner.pid) ? owner : null;
}

export async function deactivate(target: string, options: { force?: boolean } = {}): Promise<boolean> {
  const targetRoot = await getRepoRoot(target);
  const lockDir = path.join(await getLockRoot(targetRoot), lockDirectoryName);
  const owner = await readOwner(lockDir);

  if (!owner) {
    return false;
  }

  if (options.force || !processIsAlive(owner.pid)) {
    await rm(lockDir, { force: true, recursive: true });
    return true;
  }

  await requestStop(lockDir);
  await waitForUnlock(lockDir, 10_000);
  return true;
}

async function createActiveLock(lockDir: string, sourceRoot: string, targetRoot: string): Promise<ActiveLock> {
  const owner: LockOwner = {
    hostname: hostname(),
    pid: process.pid,
    sourceRoot,
    targetRoot,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    token: crypto.randomUUID(),
  };
  const ownerPath = path.join(lockDir, ownerFileName);
  const manifestPath = path.join(lockDir, manifestFileName);
  const stopPath = path.join(lockDir, stopFileName);

  await writeJson(ownerPath, owner);
  await writeJson(manifestPath, []);

  return {
    lockDir,
    manifestPath,
    owner,
    heartbeat: async () => {
      owner.updatedAt = new Date().toISOString();
      await writeJson(ownerPath, owner);
    },
    isStopRequested: async () => pathExists(stopPath),
    readManifest: async () => readJson<string[]>(manifestPath, []),
    release: async () => {
      if (await ownsLock(ownerPath, owner)) {
        await rm(lockDir, { force: true, recursive: true });
      }
    },
    stillOwnsLock: async () => ownsLock(ownerPath, owner),
    writeManifest: async (files: string[]) => {
      await writeJson(manifestPath, files);
    },
  };
}

async function getLockRoot(targetRoot: string): Promise<string> {
  return path.join(await getCommonGitDir(targetRoot), 'hotspot');
}

async function readOwner(lockDir: string): Promise<LockOwner | null> {
  return readJson<LockOwner | null>(path.join(lockDir, ownerFileName), null);
}

async function requestStop(lockDir: string): Promise<void> {
  await writeFile(path.join(lockDir, stopFileName), new Date().toISOString());
}

async function waitForUnlock(lockDir: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (await pathExists(lockDir)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for active sync to stop: ${lockDir}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function ownsLock(ownerPath: string, owner: LockOwner): Promise<boolean> {
  const currentOwner = await readJson<LockOwner | null>(ownerPath, null);
  return currentOwner?.pid === owner.pid && currentOwner.token === owner.token;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
