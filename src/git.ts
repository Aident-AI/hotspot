import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const maxBuffer = 128 * 1024 * 1024;

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer,
  });

  return stdout.trimEnd();
}

export async function getRepoRoot(cwd: string): Promise<string> {
  const root = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  return realpath(root);
}

export async function getCommonGitDir(cwd: string): Promise<string> {
  const gitDir = await runGit(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return realpath(gitDir);
}

export async function listSourceFiles(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const deleted = new Set(parseNullDelimited(await runGit(cwd, ['ls-files', '-z', '--deleted'])));
  return parseNullDelimited(output).filter((filePath) => !deleted.has(filePath));
}

export async function listTrackedFiles(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, ['ls-files', '-z', '--cached']);
  return parseNullDelimited(output);
}

export function parseNullDelimited(output: string): string[] {
  return output
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => !isGitMetadataPath(filePath))
    .sort();
}

export function resolveRepoFile(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (resolved !== root && !resolved.startsWith(rootWithSeparator)) {
    throw new Error(`Refusing to access path outside repo: ${relativePath}`);
  }

  if (isGitMetadataPath(relativePath)) {
    throw new Error(`Refusing to access Git metadata path: ${relativePath}`);
  }

  return resolved;
}

function isGitMetadataPath(relativePath: string): boolean {
  return relativePath === '.git' || relativePath.startsWith('.git/');
}
