---
name: write-once-stub-submodule-pin-check
description: |
  Before fixing a "missing call" in a write-once generator stub (a hand-editable
  file protected by generate.py's _write_stub()/skip-if-exists logic, e.g.
  service_after_create.ts), verify — per target deployment environment — that
  the app-generator submodule pin actually contains the commit that introduced
  the function being called. Use `git merge-base <introducing_commit> <pin_HEAD>`
  and check whether the introducing commit is an ancestor of the pin. If it is
  not, the "missing call" diagnosis is wrong for that environment: the real
  defect is "feature not yet reachable" (helper module doesn't exist at all),
  and simply adding the call breaks the build (unresolved import) instead of
  fixing anything. Trigger when a bug report says a write-once stub is "missing
  a call to X", when a fix is proposed for the same stub across multiple
  project instances/customer deployments with independently pinned
  app-generator submodules, or when root-cause analysis was performed against
  only one environment but the fix will be applied more broadly.
  Do NOT use for: stubs in a single environment where the pin is already known
  to be current (no cross-environment ambiguity). Generic write-once/gitignore
  mechanics unrelated to submodule pin generations. General branch
  content-verification unrelated to write-once stubs.
---

# write-once-stub-submodule-pin-check

## North Star

A write-once stub is protected by `generate.py`'s skip-if-exists logic
(`_write_stub()`): once the file exists on disk, regenerating the project never
overwrites it again. This makes each deployed instance's stub a frozen
snapshot of whatever the generator template looked like *at the pin commit in
effect when the stub was first generated*. When a generator feature is added
later (e.g. a new helper function a stub template should call), a single root-
cause analysis performed against one environment can be dangerously
non-representative of every other environment, because each environment's
`app-generator` submodule may be pinned to a different commit.

"The call is missing" and "the feature has never reached this environment"
look identical from the stub's content alone, but they require different
fixes — and treating the second as the first breaks the build.

## The failure pattern

Root-cause analysis diagnosed a write-once stub (`service_after_create.ts`,
generated from `service_after_create_stub.ts.jinja2`) as simply missing a
call to `notifyApprovalRequestCreated()`. That diagnosis was correct for the
project's official deployment (submodule pinned at commit `7fa1fc2`) — the
call was verified present in all 3 affected entities there.

But a second deployment instance (a different customer profile, submodule
pinned at `86fb07b`) has the *identical file content* (52 lines, no call,
matches the diagnosis exactly) for a completely different reason:
`git merge-base 465a78f 86fb07b` = `729aa52`, and `465a78f` (the commit that
introduced `lib/_notifyApprovalRequest.ts` itself) is not an ancestor of
`86fb07b`. The helper module the fix wants to call does not exist anywhere in
that submodule pin — `find . -iname '*notifyApprov*'` returns 0 hits. Adding
the one-line call there does not fix a gap; it introduces an unresolved
import and breaks the build.

## Procedure

For every deployment environment (project instance / customer profile /
worktree) that the write-once stub fix is meant to cover:

1. Identify the commit that introduced the function/feature the fix wants to
   call (`git log -S'<function_name>'` or the commit referenced in the RCA).
2. Identify that environment's `app-generator` submodule pin HEAD.
3. Run `git merge-base <introducing_commit> <pin_HEAD>`.
4. Compare the merge-base result to `<introducing_commit>`:
   - If `merge-base == introducing_commit` (i.e. the introducing commit is an
     ancestor of the pin), the feature is reachable — "missing call" is the
     correct diagnosis, patch the stub as planned.
   - If they differ, the feature is **not reachable** in this environment.
     Adding the call will not compile/resolve. Do not patch. Escalate: either
     (a) advance that environment's submodule pin (may require rebase/conflict
     resolution — treat as a separate, larger task), (b) backport just the
     missing helper module (verify its own transitive dependencies first), or
     (c) declare that environment out of scope for the current fix and record
     that the underlying defect is knowingly left unaddressed there.
5. Do this check **before** editing any file in that environment. If step 4
   reveals unreachability, stop and report rather than committing a change
   that will break the build.

## Do NOT

- Do not assume an RCA performed against one environment's stub content
  generalizes to every environment with the same-looking stub — identical
  file content does not imply identical submodule pin generation.
- Do not add a call to a function/module without first confirming (via
  merge-base) that the module exists in that environment's pin.
- Do not silently expand scope to fix pin-lag environments as part of a
  "minimal diff" task — advancing a submodule pin is a distinct, larger,
  separately-scoped change (assessed as HIGH risk / out of scope in the case
  above).
