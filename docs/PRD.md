# Hotspot Product Requirements

## Status

In Progress

## Summary

Hotspot is a CLI that mirrors exactly one active Git worktree into a stable target checkout. It lets developers and coding agents keep a dev server running from a fixed directory while switching which worktree is currently being previewed.

## Problem

Modern agent workflows often create several Git worktrees for parallel attempts at the same task. Most web app dev servers, browser sessions, tunnels, environment files, local caches, and editor integrations are anchored to one checkout path. Switching the dev server between worktrees is slow and easy to get wrong, especially when multiple agents are editing in parallel.

Users need a way to keep the dev server attached to one target checkout while quickly swapping which worktree's files appear there.

## Goals

- Mirror one active source worktree into one target checkout.
- Enforce singleton ownership so only one source can be active for a target at a time.
- Support fast source switching with an explicit replace operation.
- Preserve ignored target-local files such as dependencies, build output, and env files.
- Work with tracked files and non-ignored untracked files so in-progress agent edits preview immediately.
- Provide a small CLI surface that humans and agents can use safely.
- Publish as an open source npm package with automated CI and release publishing.

## Non-Goals

- Replace Git branches, Git worktrees, rebases, merges, or cherry-picks.
- Synchronize bidirectionally between source and target.
- Preserve meaningful edits made directly in the target checkout.
- Sync ignored files such as `.env`, `node_modules`, `.next`, or build artifacts.
- Provide a GUI, daemon manager, or editor extension in the initial release.
- Resolve merge conflicts between multiple active worktrees.

## Users

- Developers running one local dev server while reviewing multiple worktree-based attempts.
- Coding agents that need to preview their work in a canonical checkout path.
- Teams using parallel-agent workflows where each agent gets its own Git worktree.

## Core Workflow

1. The user starts the dev server from the target checkout.
2. The user or agent activates a source worktree with `hotspot activate <source> --target <target>`.
3. Hotspot mirrors the source file set into the target checkout and watches the source for changes.
4. The dev server hot-reloads from the stable target path.
5. The user switches sources with `hotspot activate <new-source> --target <target> --replace`.
6. The user stops mirroring with `hotspot deactivate --target <target>`.

## Functional Requirements

### CLI

- `hotspot activate <source> --target <target>` starts live mirroring from source to target.
- `hotspot activate <source> --target <target> --replace` stops the current active owner and starts the new source.
- `hotspot sync <source> --target <target>` runs one locked mirror pass without watching.
- `hotspot status --target <target>` reports the active source, target, PID, and timestamps.
- `hotspot deactivate --target <target>` requests a clean stop.
- `hotspot deactivate --target <target> --force` removes stale lock state.

### Mirroring

- Source files come from `git ls-files --cached --others --exclude-standard`.
- Unstaged deletes must be reflected in the target.
- Symlinks should be copied as symlinks rather than dereferenced.
- File permissions for regular files should be preserved where practical.
- Files removed from the active source should be removed from the target if Hotspot previously mirrored them.
- Ignored files and target-local runtime artifacts must not be copied from the source or deleted from the target.

### Locking

- Each target repo has one active lock under its common Git directory.
- A second activation without `--replace` fails with the current owner information.
- `--replace` asks the current owner to stop, waits for lock release, then starts the new owner.
- Stale locks from dead processes can be cleaned up.

### Agent Support

- The package includes `.agents/skills/hotspot/SKILL.md`.
- The skill must describe installation, status checks, activation, replacement, deactivation, and safe operating assumptions.
- Agent instructions should prefer checking target repo status before activation.

### Distribution

- The package publishes to npm as `@aident-ai/hotspot`.
- The installed binary is `hotspot`.
- CI runs typecheck, tests, and package-content checks.
- Publishing runs through GitHub Actions using npm trusted publishing OIDC.

## Safety Requirements

- Hotspot must make it clear that the target checkout is modified by design.
- Hotspot should discourage direct edits in the target checkout during an active mirror session.
- Hotspot must avoid reading from or writing to `.git` paths.
- Hotspot should fail fast when source or target is not a Git worktree.
- Hotspot should not hide copy, lock, or Git failures behind silent retries.

## Success Metrics

- A developer can switch between two active worktrees without restarting the dev server.
- A changed source file appears in the target checkout within a short debounce interval.
- CI passes on supported Node versions.
- The npm package installs globally and exposes `hotspot --help`.
- The bundled skill gives agents enough information to operate the CLI without additional repo context.

## Open Questions

- Should Hotspot support include/exclude overrides beyond Git ignore rules?
- Should Hotspot expose a dry-run mode for first-time activation?
- Should Hotspot optionally restore the target checkout to its original branch state on deactivate?
- Should there be a machine-readable status output for agents?
- Should release automation create GitHub releases from version tags, or should releases stay manually approved?
