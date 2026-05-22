---
name: hotspot
description: Use when a user wants to preview, hot-reload, swap, or sync one active Git worktree into a stable checkout with the hotspot CLI. Helps agents run a long-lived dev server from one repo folder while switching which worktree is mirrored into it.
---

# Hotspot

Hotspot mirrors one active Git worktree into a stable target checkout. Use it when the user wants a dev server to keep running from the target repo while agents or editors make changes in separate worktrees.

## Install

Install the CLI globally:

```bash
npm install --global @aident-ai/hotspot
```

Confirm the binary is available:

```bash
hotspot --help
```

If global installation is not available, run the CLI through npm:

```bash
npx @aident-ai/hotspot --help
```

## Commands

Check current ownership first:

```bash
hotspot status --target <target-checkout>
```

Start live mirroring:

```bash
hotspot activate <source-worktree> --target <target-checkout>
```

Switch the active source:

```bash
hotspot activate <new-source-worktree> --target <target-checkout> --replace
```

Stop mirroring:

```bash
hotspot deactivate --target <target-checkout>
```

Run one mirror pass without watching:

```bash
hotspot sync <source-worktree> --target <target-checkout>
```

## Agent Workflow

1. Confirm `<source-worktree>` and `<target-checkout>` are Git worktrees for the same repo.
2. Run `git status --short` in the target checkout and avoid mixing Hotspot output with meaningful local edits unless the user explicitly wants that checkout used for previewing.
3. Run `hotspot status --target <target-checkout>` before activation.
4. Use `--replace` only when the user wants to switch the active preview source.
5. Keep the dev server running from the target checkout, not from the source worktree.
6. Use `hotspot deactivate --target <target-checkout>` when the preview session is done.

Hotspot copies tracked files plus non-ignored untracked files from the source into the target. Ignored files such as `node_modules`, build output, and local env files stay in the target checkout.
