---
name: stack-reset
description: Full teardown, rebuild, provision, and verify cycle for the docker compose stack. QA-owned operation.
---

# Stack Reset

## Purpose

Rebuild the docker compose stack from a clean state. Used when (a) database schema changes require a fresh volume, (b) container images drift from the shipped code, (c) the stack is in an unknown state after a failed deploy or interrupted migration, (d) explicit operator request to start over. Prevents the failure class where "it worked yesterday" turns into untracked divergence between running containers and current source.

**Why it exists as a named skill:** the reset sequence has a required order (teardown → rebuild → health-check → dep-install → provision → smoke) and multiple easy-to-miss details (the worktree-directory cwd, the `--group test` sync flag, conditional re-provisioning). Ad-hoc resets tend to skip the health-check gate or run compose from the wrong cwd. Capturing the recipe once makes the sequence reproducible.

## Preconditions

Before invoking this skill, the caller MUST verify:

- **Role:** caller is the QA agent. Other roles MUST request a reset via `message_type="stack_request"` rather than invoking this skill directly.
- **Working directory:** commands will run from `/workspaces/convo/.worktrees/qa` (the QA Worktree). Running from any other cwd is a silent failure — the compose file there carries `BACKEND_SRC` volume mounts that bind worktree source into containers; without them, containers build with stale or wrong source.
- **Docker daemon:** `docker info` exits 0. If the daemon isn't running, every subsequent step fails with opaque errors.
- **Pending requester context:** if the reset was requested via a channel `stack_request` message, the `event_id` is known so the post-reset status-update can reply-to the request rather than creating an orphan thread.

## Invariants

These MUST hold throughout the reset:

- **Ordering is absolute.** Steps in Procedure MUST execute in order. Parallelizing or reordering (e.g., installing test deps before services are healthy) produces misleading failures.
- **No cross-stack contamination.** The reset operates on the `convo-qa` compose project only. Commands MUST NOT affect `convo` (host) or `convo-impl` (Implementation) stacks running on the same docker daemon.
- **Truthful status reporting.** QA MUST NOT post "stack reset complete" until smoke tests have passed in step 8. Reporting complete with a red smoke is a protocol violation.

## Postconditions

On successful completion:

- All five `convo-qa-*` containers (postgres, redis, backend, frontend, caddy) are in `running` state.
- Test dependencies (`--group test`) are installed inside `convo-qa-backend-1`.
- Actors exist in the QA database (either preserved across the volume or re-provisioned in step 6).
- `pytest -x -q` exits 0 against the current worktree code.
- A `status_update` has been posted to the channel confirming operational state, including the test pass count.

On failure at any step, the skill stops rather than proceeding. The postconditions above do not hold, and the caller is notified via a channel message describing the failure point — not a "stack reset complete" status.

## Procedure

1. **Change to the QA Worktree.**
   ```bash
   cd /workspaces/convo/.worktrees/qa
   ```

2. **Tear down the existing stack.** MUST be `down`, not `stop` — clean state requires container removal:
   ```bash
   docker compose -p convo-qa --env-file .env.qa down
   ```

3. **Rebuild and start all services:**
   ```bash
   docker compose -p convo-qa --env-file .env.qa up --build -d
   ```

4. **Wait for all services healthy.** MUST verify every service shows `running` before proceeding:
   ```bash
   docker compose -p convo-qa --env-file .env.qa ps
   ```
   Proceeding early produces test failures that look like application bugs.

5. **Install test dependencies.** The `--group test` flag is required; without it, `pytest` and test-only deps are absent:
   ```bash
   docker exec convo-qa-backend-1 uv sync --group test
   ```

6. **Re-provision only if the database volume was removed.** Actors persist across rebuilds; skip otherwise:
   ```bash
   docker exec convo-qa-backend-1 python scripts/provision_actors.py
   ```

7. **Verify identity:** run `whoami` in the QA agent session; identity MUST resolve.

8. **Run smoke tests:**
   ```bash
   docker exec convo-qa-backend-1 uv run pytest -x -q
   ```
   `-x` exits on first failure; `-q` suppresses noise. Smoke MUST pass before step 9.

9. **Post the completion status_update to the channel:**
   ```
   Stack reset complete. All services running. [N] tests passed. Ready for work.
   ```
   SHOULD be a `status_update`, not a top-level message, to avoid operational noise.

## Practice

**When to use `down -v` (volume removal) vs. plain `down`.** Plain `down` preserves the PostgreSQL volume; volumes persist actors, tenant schemas, accumulated test data. `down -v` wipes volumes and forces full re-provisioning. Default to plain `down` unless the schema itself has changed and a clean database is required. Flag any `down -v` invocation to the requester so they're aware data was wiped.

**Smoke test failure handling.** If step 8 fails, invariant 3 ("truthful status reporting") forbids proceeding to step 9. Re-run with `pytest -x -q --tb=short` for a readable traceback, then decide: (a) real regression, re-escalate; (b) flaky test, retry once; (c) infrastructure issue (Redis unreachable, Postgres slow), investigate before proceeding.

**Posting discipline for step 9.** The status_update is the signal other agents use to know QA is operational. Post promptly after smoke passes; don't wait for additional verification unless the requester asked for it.

**Playwright system deps in the frontend container.** The QA frontend image does NOT carry `libglib-2.0.so.0` (and friends) needed by headless Chromium. First Playwright run after a rebuild fails with `error while loading shared libraries`. Once per container lifetime, after step 4 succeeds:

```bash
docker exec -u root convo-qa-frontend-1 npx playwright install-deps chromium
```

The deps persist until the container is recreated (which `down` does), so re-install after every full `stack-reset`. Until the frontend Dockerfile adds this to the image build (F-STACKRESET-PLAYWRIGHT-DEPS), the runtime install is the canonical path.

## Defined terms

- **QA Worktree** — `/workspaces/convo/.worktrees/qa/`, the filesystem location where QA's compose commands MUST run.
- **QA stack** — the `convo-qa` docker compose project, built from the QA Worktree's compose file with `.env.qa`.
- **BACKEND_SRC** — environment variable in `.env.qa` pointing to the QA Worktree's `backend/` directory, enabling live-source bind-mount.

