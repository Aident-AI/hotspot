# Hotspot

Hotspot mirrors one active Git worktree into a stable checkout so your dev server can keep running from the same directory while you swap which worktree it previews.

It is built for parallel coding-agent workflows: several worktrees can make progress at the same time, but exactly one is reflected into the checkout that your browser, tunnel, env files, caches, and dev server already use.

## Why

Git worktrees are good for parallel work, but local development usually has one "real" checkout wired to:

- a long-running dev server
- browser sessions and local URLs
- env files and secrets
- build caches and dependencies
- editor, debugger, and tunnel configuration

Hotspot keeps that checkout stable and mirrors the selected source worktree into it.

## Install

Install globally from npm:

```bash
npm install --global @aident-ai/hotspot
hotspot --help
```

Run without installing:

```bash
npx @aident-ai/hotspot --help
```

Requirements:

- Node.js 20 or newer
- Git
- A source and target that are Git worktrees for the same project

## Quick Start

Start your dev server from the stable target checkout:

```bash
cd ~/repos/my-app
pnpm dev
```

In another terminal, activate a source worktree:

```bash
hotspot activate ~/repos/my-app-worktrees/feature-a --target ~/repos/my-app
```

Now edit files in `feature-a`. Hotspot mirrors tracked and non-ignored untracked files into `~/repos/my-app`, and your existing dev server reloads from that stable path.

Switch to another worktree:

```bash
hotspot activate ~/repos/my-app-worktrees/feature-b --target ~/repos/my-app --replace
```

Stop mirroring:

```bash
hotspot deactivate --target ~/repos/my-app
```

## Commands

| Command | Purpose |
| --- | --- |
| `hotspot activate <source> --target <target>` | Start live mirroring from a source worktree into the target checkout. |
| `hotspot activate <source> --target <target> --replace` | Switch the active source for the target checkout. |
| `hotspot sync <source> --target <target>` | Run one locked mirror pass without watching. |
| `hotspot status --target <target>` | Show the active source, target, PID, and timestamps. |
| `hotspot deactivate --target <target>` | Ask the active process to stop and release the lock. |
| `hotspot deactivate --target <target> --force` | Remove stale lock state without waiting for the owner. |

## Mental Model

Hotspot is one-way mirroring:

```text
source worktree  ->  target checkout  ->  dev server
```

Make meaningful edits in the source worktree. Treat the target checkout as a preview surface while Hotspot is active.

## What Gets Mirrored

The source file set comes from Git:

```bash
git ls-files --cached --others --exclude-standard
```

That means Hotspot mirrors:

- tracked files
- modified tracked files
- non-ignored untracked files
- unstaged deletes
- symlinks, copied as symlinks

Hotspot does not mirror ignored files such as:

- `node_modules`
- `.next`
- build output
- `.env` files
- editor or cache files covered by `.gitignore`

On first activation, tracked files that exist in the target but not the source are removed so branch-level deletes are reflected. After that, files previously mirrored from the source are removed if they disappear from the active worktree.

## Locking And Replacement

Hotspot creates an atomic lock directory under the target repo's common Git directory:

```text
<common-git-dir>/hotspot/active.lock
```

Only one process can own the target at a time.

- A second `activate` fails and reports the current owner.
- `activate --replace` asks the current owner to stop, waits for lock release, then starts the new mirror.
- `deactivate` requests a clean stop.
- `deactivate --force` removes stale lock state.

## Safety Notes

Hotspot intentionally modifies the target checkout.

Use it on a checkout whose purpose is local previewing. Avoid making direct edits in the target while Hotspot is active, because the next mirror pass can overwrite files managed by the active source.

Hotspot avoids `.git` paths and relies on Git's ignore rules for deciding what belongs to the source file set.

## Agent Skill

The npm package includes agent instructions at:

```text
.agents/skills/hotspot/SKILL.md
```

Agents should read that skill when asked to preview, hot-reload, swap, or sync Git worktrees with Hotspot. The skill includes install commands and the safe activation workflow.

## Product Requirements

The product requirements document lives at [docs/PRD.md](docs/PRD.md).

It describes the core workflow, goals, non-goals, functional requirements, safety requirements, and open questions.

## Development

Install dependencies:

```bash
pnpm install
```

Run local checks:

```bash
pnpm typecheck
pnpm test
pnpm pack --dry-run
```

Build the CLI:

```bash
pnpm build
node dist/src/cli.js --help
```

Link for local use:

```bash
pnpm link --global
hotspot --help
```

## CI And Publishing

CI runs on pushes to `main` and pull requests:

- typecheck
- tests
- package-content dry run

The package publishes to npm as `@aident-ai/hotspot`, and the installed binary is `hotspot`.

Publishing is configured through GitHub Actions and npm trusted publishing OIDC. In npm package settings, add a trusted publisher with:

| Field | Value |
| --- | --- |
| Organization/user | `Aident-AI` |
| Repository | `hotspot` |
| Workflow filename | `publish.yml` |
| Allowed action | `npm publish` |

Then publish a GitHub release from a tag such as `v0.1.0`.

## License

MIT
