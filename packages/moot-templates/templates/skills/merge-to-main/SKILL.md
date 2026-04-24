---
name: merge-to-main
description: Merge the current branch (or a named branch) into main from a worktree. Handles the worktree constraint where main is checked out at the host repo path. Defaults to the convo repo at /workspaces/convo; pass an explicit repo path for other repos on the same filesystem (e.g. mootup-io/moot).
argument-hint: [branch-name (default: current branch)] [repo-path (default: /workspaces/convo)]
---

# Merge to Main

## Purpose

Fast-forward `main` with a named branch, working around the git-worktree constraint that prevents `git checkout main` from a non-host worktree. Used by Product for non-feature commits (roadmap edits, retro synthesis, product-doc updates) and by Leader for squash-merging shipped feature branches.

**Why it exists as a named skill:** the worktree constraint is non-obvious — `git checkout main` from a worktree fails with "already used by worktree," and the fix (`git -C <repo-path>`) is specific to each repo's host location. Capturing the pattern once avoids every caller rediscovering it.

## Preconditions

- **Role:** caller is authorized to merge. Product owns non-feature merges day-to-day; Leader owns feature squash-merges. Other roles MUST request via `message_type="git_request"` rather than invoking this skill directly.
- **Branch is mergeable.** Branch exists, is current (rebased on main) or rebaseable without conflict, and represents work intended to land on main.
- **Repo path is correct.** Default is `/workspaces/convo` for the convo repo; for mootup-io/moot, `/workspaces/convo/mootup-io/moot`. Wrong repo path fails at step 4 with "not a git repository."
- **Current worktree has clean tree.** Any uncommitted changes MUST be committed or stashed before merge; the rebase in step 3 will refuse to run against a dirty tree.

## Invariants

- **No `git checkout main` from a worktree.** It fails loudly on the current repo but is the pattern-error this skill exists to prevent; cover every branch-switching operation with `git -C <repo-path>`.
- **Fast-forward only.** `--ff-only` is mandatory. Non-ff merges on main create merge commits, breaking the linear-history convention the pipeline depends on. If ff fails, the fix is `git rebase main` from the worktree, then retry — not `--no-ff`.
- **No force-push to main.** Never. This skill does not push; if a caller is about to force-push main, they're in the wrong skill.
- **Destructive operations require an authorization trail.** If rebase produces conflicts that require judgment, resolve them explicitly and reference the conflict resolution in the commit chain — don't silently take one side over the other.

## Postconditions

- `main` on the host repo is advanced to the branch's tip (or merged-into-tip if the branch was on top).
- `git -C <repo-path> log --oneline -3` shows the new main with the merged commit(s).
- The caller's worktree may be ahead of, behind, or even with the new main — not required to be synced automatically. Callers that need to sync their worktree call `git reset --hard main` as a follow-up.

## Repo path reference

| Repo | Host path |
|---|---|
| convo (default) | `/workspaces/convo` |
| mootup-io/moot | `/workspaces/convo/mootup-io/moot` |

The repo path is the directory containing the host worktree's `.git/` (or the gitfile pointing into it). All `git -C <repo-path>` commands in Procedure substitute this path.

## Procedure

1. **Determine source branch and repo path:**
   ```bash
   git branch --show-current
   ```
   The current branch is the default source; pass a branch name argument to override. The repo path defaults to `/workspaces/convo`.

2. **Show what will be merged:**
   ```bash
   git log --oneline main..<branch>
   git diff main...<branch> --stat
   ```

3. **Rebase onto main so the merge is a fast-forward:**
   ```bash
   git rebase main
   ```
   If conflicts occur, resolve before continuing.

4. **Fast-forward main from the host repo:**
   ```bash
   git -C <repo-path> merge <branch> --ff-only
   ```

5. **Confirm the merge:**
   ```bash
   git -C <repo-path> log --oneline -3
   ```

## Practice

**Merging agent branches into a feature branch.** For merging agent branches (e.g., `spec/<slug>`) into a feature branch (e.g., `feat/<slug>`), the same worktree constraint applies if the target branch is checked out elsewhere. Use the same `git -C <repo-path>` pattern, targeting whichever worktree has the branch checked out, or merge locally if the target branch is not checked out in any other worktree.

**`git -C <repo-path> update-ref` as an alternative to `merge --ff-only`.** When the branch is already a clean fast-forward ahead of main (confirmed via `git log main..<branch>`), `update-ref` moves main directly without the merge dance:
```bash
git -C <repo-path> update-ref refs/heads/main <new-tip-sha> <expected-old-sha>
```
The `<expected-old-sha>` guards against concurrent updates. Faster than the merge form when the branch is clean; equivalent result. Prefer this when the branch is certain-ff and the worktree constraint makes normal merge unreachable.

**After merging, clean up the per-feature branch.** `git branch -D <branch>` keeps the branch list clean. Home branches (`<role>/work`, `product/work`) are kept; per-feature branches (`product/<slug>`) are deleted after merge.

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `'main' is already used by worktree` | Tried `git checkout main` from a worktree | Use `git -C <repo-path>` instead |
| `Not possible to fast-forward` | Histories diverged (duplicate commits from another worktree) | `git rebase main` first, then retry |
| `fatal: not a git repository` on `git -C <repo-path>` | Wrong repo path, or repo not cloned there | Verify with `ls <repo-path>/.git`. For mootup-io/moot, the path is `/workspaces/convo/mootup-io/moot` |
| `update-ref: cannot lock ref` | `<expected-old-sha>` doesn't match current main | Someone else advanced main concurrently; re-read main tip and retry |

## Defined terms

- **Host repo** — the checked-out working copy at the repo's root path (e.g., `/workspaces/convo` for convo). Holds `main`.
- **Worktree** — a secondary working copy under `<repo>/.worktrees/<role>/`. Cannot check out `main` because the host repo holds it.
- **Repo path** — the filesystem path used as `<repo-path>` in `git -C`; the host repo's root directory.

