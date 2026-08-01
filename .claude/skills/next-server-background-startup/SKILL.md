---
name: next-server-background-startup
description: |
  When manually verifying behavior that requires running `next start` (or any
  long-lived server process) outside the project's official npm scripts —
  e.g. a multi-instance simulation, a one-off manual check — start it via a
  harness-tracked background-process mechanism (e.g. the Bash tool's
  `run_in_background: true`), never via `nohup ... &`. A `nohup`-backgrounded
  process becomes an orphan that can't be reclaimed by killing it, because
  killing-by-PID risks terminating unrelated processes sharing the same
  session and should be avoided in favor of graceful, handle-based shutdown —
  there is no session-level mechanism left to stop a `nohup`'d process
  cleanly, and it sits on its port until a human intervenes. A
  harness-tracked background process, by contrast, can be stopped cleanly via
  the harness's own stop mechanism, no PID-kill needed. Trigger when a task
  requires starting `next start` (or an equivalent long-lived dev/prod server
  process) manually via a shell tool outside `npm run test:e2e:start` or
  similar official scripts — e.g. multi-instance simulation, ad-hoc manual
  verification, reproducing a race condition.
  Do NOT use for: server startup via official npm scripts
  (`test:e2e:cy:api`, `test:e2e:start`, etc.) — those already manage their
  own process lifecycle correctly and this concern doesn't apply. Stopping
  processes in general — this skill is only about choosing the right
  *startup* mechanism so a cleanly-stoppable process is the one that gets
  created in the first place.
---

# next-server-background-startup

## North Star

Killing a process by PID (`kill`, `pkill`, etc.) risks terminating unrelated
processes that happen to share the same session or process group — a real
risk when several servers or agents run in the same environment. The safer
principle is to avoid PID-based kills entirely and prefer graceful shutdown
via a process handle or port-based readiness check. But that only works if
the process was started through a mechanism that *keeps* a handle on it. The
Bash tool's `run_in_background: true` option (or the equivalent
harness-tracked backgrounding mechanism in your environment) is exactly that:
it hands lifecycle management to the harness, which can stop the process
cleanly without ever invoking a raw kill command. `nohup ... &` backgrounding,
by contrast, detaches the process from any tracking entirely — once started
this way, there is no clean way to stop it again short of hunting down its
PID and risking collateral damage. The process becomes a stranded orphan
sitting on its port, and cleanup requires manual intervention.

## Rule

When a verification task requires starting `next start` (or any long-lived
server) manually, outside the project's official npm scripts:

- **Use**: `Bash({ command: "npm run start", run_in_background: true })` (or
  your harness's equivalent) — stoppable through the harness, no PID-kill
  involved.
- **Never use**: `nohup npm run start > log 2>&1 &` or any other manual
  `&`-backgrounding — the resulting process is unreachable by any clean means
  once created.
- Prefer the project's official scripts (e.g. `test:e2e:start`,
  `test:e2e:cy:api`) wherever they already cover the scenario — they manage
  their own process lifecycle correctly. Reach for manual `next start` only
  when the official scripts don't cover what's being verified (e.g. running
  two independent instances against a shared test DB for a multi-instance
  simulation).

## Example

Verifying that DB-polling-based notification delivery works across separate
Next.js processes (approximating a multi-instance production environment)
required starting two independent `next start` processes (instance A on port
3050, instance B on port 3051) against a shared test Postgres — a scenario no
official npm script covers. Early in the same verification session, a
`nohup ... &` invocation was used to start a manual verification server and
produced an orphaned process on an unrelated port that no clean shutdown path
could reach — requiring manual intervention (`ss -ltn | grep <port>`) to
locate and confirm. After identifying the cause, the actual multi-instance
simulation processes (ports 3050/3051) were started via the harness-tracked
background mechanism instead, and were cleanly stopped afterward through the
harness's own stop command with no PID-kill involved — the difference in
outcome traced entirely to the startup mechanism, not anything about the
processes themselves.

## Do NOT

- Do not background a manually-started `next start` (or any long-lived
  process) with `nohup ... &` — use a harness-tracked background mechanism
  instead.
- Do not assume "I'll just kill it after I'm done" is a fallback plan —
  PID-based kills risk collateral damage to unrelated processes and should be
  avoided, with no exception for self-started processes.
- Do not skip checking whether an official npm script already covers the
  scenario before reaching for a manual server start.
