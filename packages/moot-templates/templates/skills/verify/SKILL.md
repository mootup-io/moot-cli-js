---
name: verify
description: QA verification workflow. Rebuild the test stack, run tests, diff against spec, and post a structured pass/fail report. Use when QA receives a handoff.
argument-hint: [commit hash or feature name]
---

# Verify

## Purpose

Run QA's end-of-pipeline verification gate on a feature handed off by Implementation. Confirms the shipped code matches the spec, tests pass, and no regressions were introduced. The failure class this skill prevents is **silent non-conformance** — Implementation's green self-report covering for a spec-deviation, a latent bug, or an incomplete test suite that only shows up when someone independently rebuilds and runs.

**Why it exists as a named skill:** verification has several easy-to-miss steps (uvicorn-doesn't-hot-reload-from-volume-mounts; residual DB connections from prior runs can cause phantom ~900-ERROR failures; the spec compliance check requires reading files against the spec, not just running tests). Each of those has bitten verification runs historically; capturing them in one place prevents rediscovery.

## Preconditions

- **Role:** caller is QA.
- **Handoff received:** a channel message from Implementation (or the feature-thread's most recent git-request ack from Leader) names the commit hash and spec file. Don't start verification without a known target.
- **Stack ready:** the QA stack is either already running with current source, or QA is about to rebuild. If unsure, run `stack-reset` first.
- **Spec file reachable:** `docs/specs/<slug>.md` (or equivalent) exists and is readable — this is the source of truth for "what was supposed to ship."

## Invariants

- **Independent verification.** QA MUST rebuild the stack or confirm the running stack reflects the handoff commit. Running tests against a stale-source container validates nothing.
- **Full pipeline run.** MUST run backend pytest + frontend build + spec compliance pass. Skipping any leg produces a false-positive verdict.
- **Truthful verdict.** Verdict is Approved OR Blocked, not "looks good" or "mostly passed." Verdicts that soften real failures break the pipeline's ship gate.
- **Report mentions Leader.** QA's verification-complete handoff MUST mention Leader (via the `mentions` parameter, not just display name in text). Leader is the ship-squash owner; without the mention, the ring stalls.
- **Small-repair scope is narrow.** QA MAY commit unambiguous bug fixes directly (wrong status code a test asserts, obvious typo, missing validation a test already covers). MUST NOT commit judgment-call or design changes — flag those in the report instead.

## Postconditions

- Backend pytest results captured (pass/fail count, new failures if any).
- Frontend build status captured (clean / errors).
- Spec compliance reviewed against the changed files (matches / deviations documented).
- A verification report exists in the feature thread, mentions Leader, states Approved or Blocked, includes test counts and review findings.
- If Approved: Leader is the next agent. If Blocked: Implementation is mentioned with what needs to change.
- Any small repairs committed to QA's branch with notes in the report.

## Procedure

1. **Identify what to verify.** Pull the handoff message (commit hash, spec file, files changed). `$ARGUMENTS` may contain the commit hash.

2. **Rebuild (or confirm current) test stack.** If in doubt about current state, invoke the `stack-reset` skill. Otherwise:
   ```bash
   docker compose up --build -d
   ```
   Wait for all services healthy.

3. **Install test dependencies:**
   ```bash
   docker exec convo-backend-1 uv sync --group test
   ```

4. **Run backend tests:**
   ```bash
   docker exec convo-backend-1 uv run pytest
   ```
   Note pass/fail counts. See Practice for handling the two most common failure patterns (residual-connection storms; uvicorn-not-reloaded runtime smokes).

5. **Check frontend build:**
   ```bash
   docker exec convo-frontend-1 npm run build
   ```

   For Playwright runs, `PLAYWRIGHT_BASE_URL` MUST be set explicitly on the `docker exec`. Without it, Playwright's config tries to spin its own `webServer` command (`cd ../backend && …`), which fails inside the frontend container. Port table (internal / external):

   | Stack | Project | Internal | External |
   |---|---|---|---|
   | Impl | `convo-impl` | 5173 | 5180 |
   | QA | `convo-qa` | 5173 | 5190 |
   | Host | `convo` | 5173 | 5173 |

   ```bash
   docker exec -e PLAYWRIGHT_BASE_URL=http://localhost:5173 convo-qa-frontend-1 npx playwright test frontend/tests/<spec>
   ```

   **First-time Playwright runs in the QA frontend container require system deps.** `libglib-2.0.so.0` is not pre-installed; once-per-container-lifetime run:

   ```bash
   docker exec -u root convo-qa-frontend-1 npx playwright install-deps chromium
   ```

   After this the tests can run under the default non-root user. See `stack-reset` practice note for persisting this across rebuilds.

6. **Spec compliance review.** Read the changed files against the spec:
   - Does the implementation match spec § 4 / § 5 / § 6?
   - Are there deviations? Are they documented + justified?
   - Were all spec test cases included?
   - Any security concerns (XSS, injection, auth bypass, tenant leakage)?

7. **Post verification report** as a reply in the feature thread, mentioning Leader:

   ```
   Verification complete for [feature] (commit [hash]).

   **Code review:** [Approved / Changes requested]
   - [finding 1]
   - [finding 2]

   **Tests:**
   - Backend: [X passed, Y failed]
   - Frontend build: [clean / errors]
   - New test coverage: [included / missing]

   **Spec compliance:** [matches / deviations noted]

   Verdict: **[Approved / Blocked]**
   ```

8. **If Approved:** mention Leader (ship). **If Blocked:** mention Implementation with specifics of what needs to change.

## Practice

**Runtime curl smokes require a backend restart even when the stack doesn't need a rebuild.** `docker exec ... uv run pytest` uses an ASGI test client that loads volume-mounted source directly — tests always run current code. But the live uvicorn process in `convo-qa-backend-1` does NOT hot-reload from the volume mount; it serves whatever source was loaded at container start. When a run has no dep changes / no image rebuild, curl smokes (Q-gates for `/oauth/<route>`, `/api/...`, etc.) MUST be preceded by `docker restart convo-qa-backend-1` (or `docker compose -p convo-qa restart backend`) so uvicorn re-loads updated source. Pytest-green but curl-404 is the telltale symptom — new code is present, uvicorn hasn't read it yet.

**~900+ ERRORs at suite start is almost always residual-connection contention.** Live DB connections left from a prior run cause phantom failures. First diagnostic step — not last resort — is a restart:
```bash
docker restart convo-qa-backend-1 convo-qa-postgres-1 convo-qa-redis-1
```
Wait for health; re-run pytest. If errors persist, investigate fixture setup / session-scoped state. If they vanish, it was residual contention and the suite is clean.

**Docs source-only greps must exclude `_build/` binary artifacts.** When running an invariant grep under `docs/site/` (e.g., `grep -rn 'pip install mootup' docs/site/`), add `--include=*.md --include=*.rst --include=*.html` to keep the check source-only. The `_build/` subtree is gitignored but the files exist on disk post-build and contain binary `.doctree`, `.pickle`, `searchindex.js` artifacts that match many plain greps. CLI-1's INV 14 first run flagged 5 `.doctree` binary matches before the filter clarified the source was clean. Pattern:
```bash
grep -rn --include='*.md' --include='*.rst' '<pattern>' docs/site/
```

**Small-repair judgment.** Commit directly when the intended behavior is unambiguous:
- A test asserts status 400 and the impl returns 500 — fix the impl to 400.
- A missing null-check that a test covers — add it.
- An obvious typo in a string literal.

Flag and don't fix when judgment is required:
- "Is this the right error code?" — that's spec territory.
- "Should this endpoint exist at all?" — Product.
- "Is the overall approach correct?" — Spec.

## Defined terms

- **QA stack** — the `convo-qa` docker compose project (see `stack-reset` skill for full definition).
- **Runtime curl smoke** — tests that hit the live uvicorn endpoint, distinct from pytest's ASGI test client. Requires backend restart to pick up source changes.
- **Residual-connection contention** — DB / Redis connections left open from a prior run's process, producing ~900+ ERROR cascade at the start of a new test session.

