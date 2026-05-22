import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from '../src/git.js';
import { acquireActiveLock } from '../src/lock.js';
import { syncOnce } from '../src/sync.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe('syncOnce', () => {
  it('mirrors tracked, changed, deleted, and untracked non-ignored files into the target checkout', async () => {
    const { source, target } = createWorktreeFixture();

    writeFileSync(path.join(source, 'app.txt'), 'from source\n');
    rmSync(path.join(source, 'removed.txt'));
    writeFileSync(path.join(source, 'added.txt'), 'new tracked candidate\n');
    writeFileSync(path.join(source, 'scratch.txt'), 'untracked included\n');
    writeFileSync(path.join(source, 'ignored.log'), 'ignored\n');

    const result = await syncOnce({
      sourceRoot: await getRepoRoot(source),
      targetRoot: await getRepoRoot(target),
    });

    assert.equal(result.removed, 1);
    assert.equal(readFileSync(path.join(target, 'app.txt'), 'utf8'), 'from source\n');
    assert.equal(readFileSync(path.join(target, 'added.txt'), 'utf8'), 'new tracked candidate\n');
    assert.equal(readFileSync(path.join(target, 'scratch.txt'), 'utf8'), 'untracked included\n');
    assert.throws(() => readFileSync(path.join(target, 'removed.txt'), 'utf8'));
    assert.throws(() => readFileSync(path.join(target, 'ignored.log'), 'utf8'));
  });

  it('removes files that were present in the previous source manifest', async () => {
    const { source, target } = createWorktreeFixture();
    writeFileSync(path.join(source, 'temporary.txt'), 'first pass\n');

    const first = await syncOnce({
      sourceRoot: await getRepoRoot(source),
      targetRoot: await getRepoRoot(target),
    });
    assert.equal(readFileSync(path.join(target, 'temporary.txt'), 'utf8'), 'first pass\n');

    rmSync(path.join(source, 'temporary.txt'));
    const second = await syncOnce({
      sourceRoot: await getRepoRoot(source),
      targetRoot: await getRepoRoot(target),
      previousFiles: first.files,
    });

    assert.equal(second.removed, 1);
    assert.throws(() => readFileSync(path.join(target, 'temporary.txt'), 'utf8'));
  });

  it('mirrors symlinks without dereferencing them', async () => {
    const { source, target } = createWorktreeFixture();
    await symlink('app.txt', path.join(source, 'app-link.txt'));

    await syncOnce({
      sourceRoot: await getRepoRoot(source),
      targetRoot: await getRepoRoot(target),
    });

    assert.equal(await readFile(path.join(target, 'app-link.txt'), 'utf8'), 'hello\n');
  });
});

describe('active lock', () => {
  it('allows only one active owner for the target repo', async () => {
    const { source, target } = createWorktreeFixture();
    const lock = await acquireActiveLock({ source, target });

    await assert.rejects(acquireActiveLock({ source, target }), /Another hotspot sync is active/);
    await lock.release();

    const nextLock = await acquireActiveLock({ source, target });
    await nextLock.release();
  });

  it('watches the active source and stops through deactivate', async () => {
    const { source, target } = createWorktreeFixture();
    const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.js');
    const child = spawn(process.execPath, [cliPath, 'activate', source, '--target', target, '--debounce', '25'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));

    try {
      await waitFor(() => output.join('').includes('Watching'));

      writeFileSync(path.join(source, 'app.txt'), 'hot reload\n');
      await waitFor(() => readFileSync(path.join(target, 'app.txt'), 'utf8') === 'hot reload\n');

      execFileSync(process.execPath, [cliPath, 'deactivate', '--target', target], { stdio: 'pipe' });
      await waitFor(() => child.exitCode !== null);
      assert.equal(child.exitCode, 0);
    } finally {
      child.kill();
    }
  });
});

function createWorktreeFixture(): { source: string; target: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-'));
  tempDirs.push(root);

  const target = path.join(root, 'repo');
  const source = path.join(root, 'feature');

  mkdirSync(target);
  git(target, ['init', '-b', 'main']);
  git(target, ['config', 'user.email', 'test@example.com']);
  git(target, ['config', 'user.name', 'Test User']);
  writeFileSync(path.join(target, '.gitignore'), '*.log\n');
  writeFileSync(path.join(target, 'app.txt'), 'hello\n');
  writeFileSync(path.join(target, 'removed.txt'), 'remove me\n');
  git(target, ['add', '.']);
  git(target, ['commit', '-m', 'initial']);
  git(target, ['worktree', 'add', '-b', 'feature', source]);

  return { source, target };
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
