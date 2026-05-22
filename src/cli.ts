#!/usr/bin/env node
import chokidar from 'chokidar';
import { Command } from 'commander';

import { acquireActiveLock, deactivate, readActiveStatus, type ActiveLock } from './lock.js';
import { syncOnce } from './sync.js';

const program = new Command();

program.name('hotspot').description('Mirror one active Git worktree into a stable checkout.');

program
  .command('activate')
  .argument('<source>', 'worktree to mirror from')
  .requiredOption('-t, --target <path>', 'checkout to mirror into')
  .option('--replace', 'replace the currently active source')
  .option('--debounce <ms>', 'watch debounce in milliseconds', parseInteger, 200)
  .action(async (source: string, options: { target: string; replace?: boolean; debounce: number }) => {
    const lock = await acquireActiveLock({
      source,
      target: options.target,
      replace: options.replace,
    });

    try {
      await runActiveSync(lock, options.debounce);
    } catch (error) {
      await lock.release();
      throw error;
    }
  });

program
  .command('sync')
  .argument('<source>', 'worktree to mirror from')
  .requiredOption('-t, --target <path>', 'checkout to mirror into')
  .action(async (source: string, options: { target: string }) => {
    const lock = await acquireActiveLock({ source, target: options.target });

    try {
      const result = await syncOnce({
        sourceRoot: lock.owner.sourceRoot,
        targetRoot: lock.owner.targetRoot,
      });

      console.log(`Synced ${result.copied} files, removed ${result.removed} files.`);
    } finally {
      await lock.release();
    }
  });

program
  .command('deactivate')
  .requiredOption('-t, --target <path>', 'checkout whose active sync should stop')
  .option('--force', 'remove the active lock without waiting for the owner')
  .action(async (options: { target: string; force?: boolean }) => {
    const stopped = await deactivate(options.target, { force: options.force });
    console.log(stopped ? 'Stopped active sync.' : 'No active sync.');
  });

program
  .command('status')
  .requiredOption('-t, --target <path>', 'checkout to inspect')
  .action(async (options: { target: string }) => {
    const owner = await readActiveStatus(options.target);

    if (!owner) {
      console.log('No active sync.');
      return;
    }

    console.log(`Active source: ${owner.sourceRoot}`);
    console.log(`Target: ${owner.targetRoot}`);
    console.log(`PID: ${owner.pid}`);
    console.log(`Started: ${owner.startedAt}`);
    console.log(`Updated: ${owner.updatedAt}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runActiveSync(lock: ActiveLock, debounceMs: number): Promise<void> {
  let manifest = await lock.readManifest();
  let running = false;
  let pending = false;
  let timer: NodeJS.Timeout | undefined;

  const run = async () => {
    if (!(await lock.stillOwnsLock())) {
      await shutdown(1);
      return;
    }

    const result = await syncOnce({
      sourceRoot: lock.owner.sourceRoot,
      targetRoot: lock.owner.targetRoot,
      previousFiles: manifest.length > 0 ? manifest : undefined,
    });
    manifest = result.files;
    await lock.writeManifest(manifest);
    await lock.heartbeat();
    console.log(`Synced ${result.copied} files, removed ${result.removed} files.`);
  };

  const syncQueued = async () => {
    if (running) {
      pending = true;
      return;
    }

    running = true;
    try {
      do {
        pending = false;
        await run();
      } while (pending);
    } finally {
      running = false;
    }
  };

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void syncQueued();
    }, debounceMs);
  };

  const watcher = chokidar.watch(lock.owner.sourceRoot, {
    ignoreInitial: true,
    ignored: (filePath) => filePath.includes('/.git/') || filePath.endsWith('/.git') || filePath.includes('/node_modules/'),
  });

  const heartbeat = setInterval(() => {
    void (async () => {
      if ((await lock.isStopRequested()) || !(await lock.stillOwnsLock())) {
        await shutdown(0);
        return;
      }

      await lock.heartbeat();
    })();
  }, 1_000);

  const shutdown = async (exitCode: number) => {
    clearInterval(heartbeat);
    if (timer) {
      clearTimeout(timer);
    }
    await watcher.close();
    await lock.release();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown(0);
  });
  process.on('SIGTERM', () => {
    void shutdown(0);
  });

  await syncQueued();
  console.log(`Watching ${lock.owner.sourceRoot} -> ${lock.owner.targetRoot}`);

  watcher.on('all', schedule);

  await new Promise(() => undefined);
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got ${value}`);
  }
  return parsed;
}
