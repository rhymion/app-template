---
name: submodule-bump-ancestor-verify
description: |
  Before bumping a submodule pointer (or otherwise landing a long-lived
  feature branch as the new canonical reference) to that branch's current
  tip, verify with `git merge-base --is-ancestor <mainline> <feature-branch>`
  whether the mainline integration branch has advanced past the feature
  branch's fork point. A literal "bump to the branch's latest tip" executed
  on a branch that forked before other commits later landed on mainline
  silently regresses every one of those mainline commits in the consumer
  that adopts the pointer. Trigger when a task instructs bumping a submodule
  pointer, adopting a feature branch as canonical, or otherwise reflecting
  a derived/long-lived branch back into a mainline or downstream project,
  especially when the branch has been alive for multiple days without
  recent rebasing.
  Do NOT use for: submodule bumps to a branch created fresh from current
  mainline tip (no divergence possible). Regular same-repo merges where git
  itself already blocks/flags conflicts from a fast-forward mismatch —
  this checklist is specifically for the "bump to branch tip" pattern where
  no merge conflict would surface the regression (the bump is a clean
  pointer update either way, hiding the regression until later discovered
  as missing functionality downstream).
---

# submodule-bump-ancestor-verify

## North Star

A submodule pointer bump (or any "make this branch the new canonical state"
operation) that targets a feature branch's current tip is only safe if that
branch already contains everything the mainline integration branch has
accumulated since the feature branch's fork point. If mainline gained N
commits after the fork (a CVE fix, generator changes, other feature work)
and the feature branch was never rebased/merged forward, bumping straight to
the feature branch's tip silently discards those N commits in whatever
consumes the new pointer — with no merge conflict to flag it, since the
bump itself is just a clean pointer/ref update. The regression surfaces later
as "missing functionality" far downstream, disconnected in time from the
bump that caused it.

## Procedure

Before bumping a submodule pointer (or landing a feature branch as canonical)
to branch `B`, against the relevant mainline integration branch `M`:

1. `git merge-base --is-ancestor M B` — exit code 0 means `M` is already
   fully contained in `B` (safe to bump as-is). Non-zero means `M` has
   commits `B` doesn't have.
2. If non-zero, list what's missing: `git log B..M --oneline` — these are
   the commits that would be silently regressed by a literal bump.
3. Merge `M` into `B` first (or otherwise land those commits), then re-run
   the mandatory gate against the merged state to confirm nothing broke.
4. Only after the gate passes on the merged state, proceed with the bump
   using the merge commit (not the pre-merge tip) as the pointer target.
5. This generalizes beyond submodules to any "reflect a derived branch back
   into canonical" operation — e.g. the submodule repository (generator
   source) → the consumer repository (testbed) via submodule, or any
   long-lived feature branch being promoted to replace a shared reference.

## Example

A feature branch forked from mainline at commit `4846274`. By the time its
submodule pointer bump was ready, mainline had advanced 13 commits ahead,
including a CRITICAL upstream-dependency CVE fix, a deployment-region
alignment fix, a generator feature addition, and other bug fixes. A literal
"bump to branch tip" would have regressed the consumer by all 13 commits with
no conflict to surface it. Instead: `git merge-base --is-ancestor` confirmed
the gap, mainline was merged into the feature branch first (no conflicts),
the mandatory gate was re-run on the merged state (fully passing), and only
then was the submodule bumped to the post-merge commit.

## Do NOT

- Do not bump a submodule pointer to a feature branch's tip without first
  checking whether the mainline integration branch has advanced past that
  branch's fork point.
- Do not treat "the bump applied cleanly, no conflicts" as proof of safety —
  a clean pointer update is exactly what happens when commits are silently
  dropped, since there's no merge to conflict.
- Do not defer this check to "we'll notice if something's missing" — the
  regression surfaces downstream, disconnected in time from the bump.
