# Hotspot

`hotspot` mirrors one active Git worktree into a stable checkout so a dev server can keep running from the same directory while you swap which worktree it previews.

It is designed for agent workflows where several worktrees can make progress in parallel, but only one should be reflected into the main repo folder at a time.

## Install

```bash
npm install --global @aident-ai/hotspot
hotspot --help
```

Or run without installing:

```bash
npx @aident-ai/hotspot --help
```

For local development:

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

Run your dev server from the normal checkout:

```bash
cd ~/repos/my-app
pnpm dev
```

In another terminal, activate a worktree as the source:

```bash
hotspot activate ~/repos/my-app-worktrees/feature-a --target ~/repos/my-app
```

Switch to another source by replacing the active sync:

```bash
hotspot activate ~/repos/my-app-worktrees/feature-b --target ~/repos/my-app --replace
```

Stop the active sync:

```bash
hotspot deactivate --target ~/repos/my-app
```

Inspect the current owner:

```bash
hotspot status --target ~/repos/my-app
```

Run a single mirror pass without watching:

```bash
hotspot sync ~/repos/my-app-worktrees/feature-a --target ~/repos/my-app
```

## What Gets Mirrored

The source file set comes from:

```bash
git ls-files --cached --others --exclude-standard
```

That means tracked files and non-ignored untracked files are copied. Ignored files such as `node_modules`, `.next`, build output, and `.env` files stay in the target checkout.

On first activation, tracked files that exist in the target but not the source are removed so branch-level deletes are reflected. After that, files previously mirrored from the source are removed if they disappear from the active worktree.

## Safety Model

`hotspot` creates an atomic lock directory under the target repo's common Git directory. A second activation fails unless `--replace` is passed. Replacement asks the current process to stop, waits for it to release the lock, then starts the new sync.

The tool intentionally modifies the target working tree. Use it on a checkout whose purpose is local previewing, and keep meaningful source edits in the worktrees.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

## Agent Skill

Agent instructions for using this CLI live at `.agents/skills/hotspot/SKILL.md` and are included in the published package.

## Publishing

CI runs on pushes to `main` and pull requests. The publish workflow runs when a GitHub release is published or manually dispatched.

The npm package is `@aident-ai/hotspot`, and the installed binary is `hotspot`. Publishing is configured for npm trusted publishing through GitHub Actions OIDC. In npm package settings, add a trusted publisher with:

- Organization/user: `Aident-AI`
- Repository: `hotspot`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

Then publish a GitHub release from a tag such as `v0.1.0`.
