---
name: implementation-workflow
description: Implementation's operational runbook — startup discipline, status ping cadence on multi-file runs, pre-draft during SPEC-READY hold, cross-worktree CWD rules, baseline measurement, multi-edit file hygiene, subagent delegation cross-reference. Invoke on Implementation startup.
---

# Implementation Workflow

## Purpose

Execute the build step of the pipeline — take a SPEC-READY spec and produce the code, tests, and commit that implement it faithfully — following accumulated disciplines that have emerged across ~30 pipeline runs. The failure class this skill prevents is **Impl re-discovering well-known traps at implement-time** (stale-index `git add -A`, cross-worktree CWD drift, uvicorn-not-hot-reloading for curl smokes, residual-connection 900-error storms, operator-name references in commits, etc.). Each rule here traces to a specific prior run's retro.

**Why it exists as a named skill:** Impl's work is sequential-and-intricate — many small disciplines compound into whether the first commit lands clean or goes through iterate-and-fix cycles. Re-reading at phase entry (when SPEC-READY lands) loads the right disciplines recent-in-context before the first edit, per the general-to-sharp ordering principle.

## Preconditions

- **Role:** caller is Implementation.
- **Home branch:** worktree is on `impl/work` (or a per-feature `impl/<slug>` during active feature work), NEVER on `main`. If a post-compact gap leaves Impl on main, `git checkout impl/work` before any work.
- **Rebase against main:** `git rebase main` at every startup so the worktree picks up Leader's merges and any Spec doc-only direct-commits to main.
- **SPEC-READY signal received** (for feature work): Leader has merged `spec/<slug>` → `feat/<slug>` and acked in the feature thread mentioning Impl. For pre-draft grounding during Spec's drafting window, the signal is earlier (Spec's status posts).

## Invariants

- **No design decisions.** Impl implements per § 6 drop-ins; scope questions escalate to Spec via `message_type="question"` in the feature thread.
- **No spec amendments mid-run by Impl.** Only Spec amends; Impl escalates.
- **`git diff --cached --stat` MUST run between `git add` and `git commit` for feature commits.** `git add -A` and `git add .` MUST NOT be used for feature commits — they pollute with stale-index state (transcripts-pending-post, test-results, etc.). Enumerate file paths from the spec's § 4 list explicitly.
- **Cross-worktree CWD discipline.** All filesystem operations run from `/workspaces/convo/.worktrees/implementation/` (Impl's worktree), NOT the host repo or another agent's worktree. Impl's docker stack (`convo-impl`) is volume-mounted from this path; running commands elsewhere silently hits stale state.
- **Home-branch anchor.** Impl's resting state is `impl/work`. Per-feature branches are `impl/<slug>` and are deleted after ship.
- **Pipeline topology invariance.** Impl does NOT post status to Product mid-Impl (that's Leader's). Impl does NOT route design questions to Product (they go to Spec). New communication edges are topology violations and get rejected at Product synthesis-filter time.

## Postconditions (per feature run)

- `impl/<slug>` branch carries a single commit (or a small sequence) implementing the spec per § 6 drop-ins.
- All spec-prescribed tests pass (§ 7 new tests + § 14 Q-gates).
- Pytest baseline from § 15 holds or increases by the new tests only — no existing tests break.
- Commit message describes WHAT shipped (not the journey to getting there), traces to the spec, and includes Q-gate results.
- A `message_type="git_request"` reply in the feature thread asks Leader to merge `impl/<slug>` → `feat/<slug>`, with a summary of files changed and any F-findings surfaced during implementation.
- Impl status is "idle, awaiting QA" post-handoff; Impl does NOT poll or acknowledge.

## Role summary

Implementation is the pipeline's **build step**. Impl receives a SPEC-READY handoff from Spec, implements per § 6 drop-in code blocks, lands new tests per § 7, verifies gates match spec § 14, and hands off to QA via a `message_type="git_request"` merge request. Impl does NOT make design decisions, amend the spec mid-run, or extend scope — scope questions escalate to Spec via `message_type="question"` in the feature thread.

This skill is Impl's runbook. CLAUDE.md describes the team topology, message types, threading discipline, and resource ownership that apply to every agent; this skill is the Impl-specific operational layer on top of that.

## Startup (on connect, restart, resume)

1. **Check your current branch FIRST** (`git branch --show-current`). **If you're on `main`, immediately `git checkout impl/work`** (creating it from main if it doesn't exist: `git checkout -b impl/work`). Non-leader agents MUST NOT linger on main — see the home-branch-discipline block in CLAUDE.md. After this check, you're on `impl/work` (the persistent home). Active feature work will move you to `impl/<slug>` via step 6 of the feature flow; between features, you stay on `impl/work`.
2. **Pull main into your worktree:** `git rebase main`. Avoids stash dances from stale branches. The worktree's branch drifts while idle as Leader lands other work; rebase at every startup. **If the spec commit landed on main directly** (Spec's doc-only-direct-commit path) rather than on `feat/<slug>`, base `impl/<slug>` on `local/main` — feat's tip will be behind spec; main carries both. Leader's subsequent FF-merge of `impl/<slug>` → feat absorbs spec + impl together cleanly. Validated on Run A-1 where Spec's merge to host-worktree landed spec on main; Impl's rebase-on-main pickup produced a clean FF-merge.
3. **Join the space**, subscribe to the channel, `whoami` to verify identity.
4. **Catch up:** `get_activity(detail="minimal")` for a quick scan, or `get_context_with_summary` after a long absence.
5. **Post status:** `update_status("idle, ready for next feature")`.
6. **Load this skill** (you are here). Also read the feedback memory tree for Impl-relevant lessons accumulated across prior runs.

## Participant-ID mention discipline — copy from tool output, never type

Before composing any first mention of an agent in a new thread or escalation, call `list_participants(detail='standard')` + copy the target agent's participant_id directly from the output into the `mentions=[...]` parameter. Do NOT type participant IDs from memory or from a prior conversation's recall — a single transposed character silently breaks token-ring delivery (the mention targets a non-existent ID; the intended recipient never sees it; sender believes the ping was delivered).

**Two incidents of this class on record** (Run AF originally; B-3 Impl's first-escalation typo `agt_1u9fubt6m6k8b` at `evt_hncejneg4dgq` is the second). The `feedback_verify_participant_ids.md` memory file captures the rule; this section reinforces at the point-of-use. Discipline is cheap (one tool call + copy) relative to the cost of a silent-delivery-failure that surfaces as a pipeline stall.

Applies especially on:
- First-mention escalations (the risk window for typos is highest when the sender is composing in a new context without recent direct interaction with the target).
- Post-compact mentions (IDs may have changed; the `{CLAUDE.md}` rule about verifying IDs after compact applies but is easy to skip when the escalation is urgent).
- Operator-initiated comms checks (all five agents' IDs required; typo risk multiplies).

## Post-source-complete-before-tests status ping

**The 4-ping-minimum rule has a high-risk gap between "source edits complete" and "tests passing".** Source edits can chain across ~10 files for 40+ min under flow state; if Impl doesn't post a status ping BEFORE kicking off Q-gate test runs, Leader sees silence from last-commit-to-test-completion with no visibility. TA-1 hit this: 40 min silence mid-impl despite 4-ping rule already existing in the skill.

**Mechanical checkpoint:** post a `update_status` immediately after source edits complete + before running `pytest -n auto` / full Q-gate battery. Status template: `"sources complete; running Q-gates"`. Takes 10 seconds; eliminates the "silent test run" window from pipeline monitoring.

If Q-gates cascade-fail into an amendment, post another status before resuming ("fixing B1 flake + re-running"). The rule is one status-ping per state transition, not a fixed time interval.

## Status ping cadence on multi-file runs

**Minimum four `update_status` calls per run longer than ~30 min:**

1. **Handoff received** — "spec received, pulled feat/<slug>, branched impl/<slug>, grounding"
2. **Source edits complete** — "source edits landed, starting tests"
3. **Tests green** — "pytest + pyright green, final checks"
4. **Ready for merge** — "merge request posted, handing to Leader"

**Add a sub-ping if baseline + grounding exceeds ~60s.** Run AA's Impl was silent ~40 min between handoff-received and first edit ping — baseline alone took 113s, grounding 5 files + reading the 526-line spec added another ~5 min. Leader pinged 3× and eventually escalated. The four-ping cadence has no anchor for the baseline+grounding middle window. When that window is non-trivial, add an interstitial: "baseline running" (between handoff-received and the next ping) or "baseline green + grounding" (when baseline finishes but grounding is ongoing). One extra `update_status` call costs nothing and prevents a Leader-cron escalation cycle.

This rule exists because four consecutive retros (Run P, Q, R, and R again) flagged Impl going silent between gates. Leader's stall-check cron catches it at 35 min; the status pings catch it at 0 min. **Self-pace on these — do not wait for Leader to ask.** The stopgap stays in place until the Phase 9.5 channel-adapter activity pulse replaces manual status updates entirely (see `docs/product/activity-pulse.md`).

For short single-file runs (~15 min), 2 pings suffice (handoff received, merge request posted). Use judgment; the minimum scales with run duration.

## Pre-draft during SPEC-READY hold

When Spec is drafting and Impl is idle, **start the pre-draft in working memory** — do NOT wait for the SPEC-READY handoff to begin analysis. Promoted from the R8 retro carryover; validated on 4+ consecutive runs.

What to do during the hold:
- Read the product doc and any linked design docs in full.
- Grep the blast radius: every file the feature will likely touch, every existing test that overlaps, every import graph the change perturbs.
- Draft a substitution sketch in your own working notes: "replace X with Y in N files; add Z test function; import A/B/C in file D."
- Note any claims in the product doc that look suspicious (stale function names, phantom file paths, outdated counts). Verify with a quick `grep` or `ls`.

When Spec's commit lands, compare your pre-draft against § 6 / § 7. Divergence between the two is fine — Spec's call wins unless it's obviously wrong, in which case escalate as `message_type="question"`. The pre-draft's job is to front-load context so the post-handoff edit cycle is shorter.

**Pre-draft value scales with spec complexity — skip for short mechanical lifts.** The pre-draft pays off when the spec has multiple sections of interesting context (D-decisions, blast-radius greps, novel patterns, multi-stage carves with non-obvious sequencing). For short mechanical-lift runs — three stages of paste-and-go, no semantic decisions, < 200 LOC of code — the pre-draft mostly duplicates the read-through and burns idle tokens. Use judgment when SPEC-READY lands: if § 5 is paste-able and § 4 is empty, skip pre-draft and jump straight to baseline measurement. Validated on Run W where Impl flagged the duplicated effort.

**Pre-draft is a defect-catching probe on the spec, not just a prep pass.** Promoted to explicit expectation post-TE-1 + post-UI-1 (2-for-2 on catching spec defects before Impl codes). During the SPEC-READY hold, probe the exact files spec § 5 will touch + the full handler chain for any backend-support claim; surface defects to Spec as `message_type="question"` reply rather than coding around them at Impl time. Specific probe patterns:

- **Declared-field-trap probe** — when spec grounding asserts "backend supports X via field Y" or "the existing route already accepts field Z," grep the FULL handler chain: request model + route function body + bridge / service method + event / model factory. TE-1 surfaced loop-6-template-missing this way; UI-1 surfaced `/speech` thread_id wiring gap (`AddSpeechRequest.thread_id` declared but `add_speech` + `add_human_speech` + `from_human_speech` all dropped it).
- **File-inventory probe** — if spec § 5's file list names a directory or template path, `ls` the target; surface any discrepancy between spec's assumed inventory and the real filesystem.
- **Function-API-smoke probe at Impl side** — complementing Spec's § 13 probe, verify the pinned-version signature of any library/stdlib symbol the spec names before pasting. Most defects Spec's signature-probe catches have matching Impl catches available.

Surface to Spec as `message_type="question"` in the feature thread with the concrete finding (not "I think this might be wrong" — "grep shows X declared but Y/Z/W drop it"). Spec amends; Impl starts coding against amended spec. Amendment cost ~60 LOC; mid-Impl escalation cost is much higher.

**Pre-draft ping is distinct from mid-impl blocker escalation.** Pre-draft ping = read SPEC-READY, spot a grounding gap, post a `message_type="question"` reply in the feature thread BEFORE starting to code — while still in pre-draft hold. Spec folds the finding pre-commit via spec amendment; Impl starts coding against the amended spec. Zero mid-impl amendment cost. Distinct from mid-impl blocker escalation (which interrupts in-flight coding). CP-2 validated: Impl's `evt_4b2tnwbpnfa9e` flagged the 5-component `isAdmin` prop-drill depth; Spec had independently re-grounded to the same conclusion and already folded it into the amended spec (`2098fe7`) before commit. Convergent catch, zero lost Impl cycles. Use pre-draft ping when the grounding gap is concrete enough to state as a finding ("grep shows X declared but Y/Z/W drop it"; "`ls` shows `tests/api/` but spec says `tests/mcp/`"); keep mid-impl blocker escalation for gaps that only surface during coding.

**Wiring-trace discipline for flows crossing ≥3 components.** After finishing component edits on a flow that spec § 5.1 diagrams as "user action → component A → component B → store → component C → POST," trace the flow manually before handoff. Pick the entry-point component; grep every prop/callback at every hop to verify each is wired. "R-tests green in isolation" is NOT the same as "feature reachable." Validated on ux-rtm's mid-run QA rejection: component tests R1–R6 all passed, but `SharedContext.svelte` never threaded `onReplyToMessage` to its 4 `EventCard` call sites + `SpaceRoom.svelte` never had `replyParent` state; the 3rd store kind `'message'` was unreachable from the UI. 40-LOC wiring-fix commit recovered cleanly, but the gap reached QA. Grep commands to run pre-handoff for every flow diagram in spec § 5.1:

- `grep -n "<childComponent>" <ancestor>.svelte` — does the child actually render at the expected site(s)?
- For each prop/callback: `grep -n "<propName>" <ancestor>.svelte <child>.svelte` — prop supplied by parent AND accepted by child?
- For flow terminators (POST body, `store.update(...)`, etc.): does the data arrive at the terminator? Trace backwards from the POST call site to the user action.
- For new `$state` / `$effect` rows: grep confirms they exist in the expected file, not accidentally dropped.

If any hop shows "declared but never supplied" or "supplied but never consumed," fix before handoff. Complements pre-draft ping (Spec-side gap catch) and baseline measurement (ship-gate discipline). This is post-edit, pre-handoff.

**Byte-identical-across-two-invocations tests must share HOME across fresh cwds, not fresh envs.** When a test runs a CLI command twice and compares outputs byte-by-byte (equivalence regression, golden-fixture substitute), the two invocations need distinct working directories (fresh project trees) BUT the SAME operator credential store (shared `HOME`). Run-one writes credential/state to fakeHome; run-two with a fresh fakeHome starts from empty state, failing auth/OAuth. Pattern:

```ts
const env = await setupFakeHome();   // fakeHome + cwd1
// ... run command 1 ...
const env2 = await setupFakeCwd();   // fresh cwd2, NO fresh HOME
env2.cleanup();                       // discard env2's separate HOME if setup created one
process.env.HOME = env.fakeHome;      // reuse env's HOME
// ... run command 2 ...
// compare outputs byte-by-byte
```

AH-h R9 byte-identical-between-no-flag-and-`--harness claude-code` hit this. The fix is a one-line `process.env.HOME = env.fakeHome;` after the second environment setup. Applies anywhere a CLI test invokes the same command twice expecting consistent auth or config state.

**`WeakKeyDictionary` / `WeakMap` memoization stubs must preserve identity-hash.** Python `@dataclass` generates `__eq__` which REMOVES the default identity-hash; `WeakKeyDictionary` requires hashable+weakref-able keys. TypeScript `WeakMap` requires non-primitive keys (plain objects or class instances fine). When test stub classes are used as `WeakKeyDictionary` / `WeakMap` keys for memoization, EITHER use a plain class with `__init__` (identity-hash by default) OR `@dataclass(eq=False)` to preserve identity-hash. AH-g pytest failed 13 of 18 on first run (`TypeError: unhashable type: 'MCPClientStub'`) because the stub was a plain `@dataclass`; fix was one-line rewrite. Add to test-infra-gotchas pre-edit discipline.

**Invariant-grep scope-qualifier reading.** When implementing a spec invariant via a grep-based test, re-read the invariant's phrasing for scope qualifiers BEFORE writing the regex. Qualifiers like "at the error-raise-site," "in the new file," "in `<specific-module>.py`" constrain the grep scope; a too-broad scan turns a legitimate invariant into a false-positive. AH-g inv 11 "error strings redact `Authorization`/`Bearer` at raise-site" initially grep'd whole `src/` tree and flagged `client.ts`'s legitimate HTTP `Authorization: Bearer` header-set — fix was to scope the grep to `connect.ts` per the spec's "at the error-raise-site" qualifier. Mirrors Spec-side "invariant-phrasing specificity" discipline: Spec specifies scope at draft time, Impl reads it carefully at grep-write time.

**Cross-repo path-disambiguation pre-escalation.** Before escalating a baseline-mismatch or "spec looks wrong" finding on a cross-repo run, enumerate candidate repo paths and verify the spec's named baseline commit exists in each:

```bash
for path in /workspaces/<org>/<repo> /workspaces/<org>/<repo>-* /workspaces/<org>/*/<repo>; do
    git -C "$path" cat-file -e <baseline-hash> 2>/dev/null && echo "FOUND at $path"
done
```

One command per candidate is cheap; posting a false-positive escalation to Spec is expensive (wastes Spec cycle + Leader routing). AH-e-bootstrap-cli Impl initially checked `/workspaces/convo/moot-cli-js` (orphan stub, LICENSE only) instead of `/workspaces/convo/mootup-io/moot-cli-js` (real repo at `093bbe7`); treated the commit-hash mismatch as spec-fatal instead of path-fatal. Leader caught + redirected within 2 min, but the false-positive cycle was avoidable. For cross-repo runs the kickoff message names the target repo; grounding should use `git -C` against the FULL path from spec § 1 Summary, not a guessed path. Pair with the spec-checklist rule that § 1 Summary names the full absolute repo root.

**Pre-draft grep for existing-test contradicting-assertions.** When spec § 7.x says "extend existing `<test-file>`" on a test that may assert behavior the new feature changes, at grounding time (before starting to edit) `grep` the existing tests for assertions directly contradicting the new behavior — error message strings, status codes, state transitions. Flag to Spec as a pre-draft question via `message_type="question"` rather than updating the assertion mid-implementation.

```bash
# For each existing test file spec says "extend":
grep -n 'expect\|assert\|toBe\|toEqual\|toThrow\|toMatch' <test-file>
# Scan the assertions for patterns that the new feature changes.
```

AH-e-bootstrap-cli hit `test_init_errors_when_not_logged_in` asserting `/not logged in/`; under OAuth-default, that path now hits headless-env-error instead. Impl updated mid-flight — cheap but the grep-at-grounding would have caught it at pre-draft ping time. Complements pre-draft ping (new Spec amendments) and wiring-trace discipline (post-edit reachability): this rule catches existing-behavior-vs-new-behavior collisions BEFORE edits begin.

**"Known flake" is an investigation hazard.** Before dismissing a failing baseline test as a flake and shipping with a note, run:
- `git log -p -- <test_file>` — when did this test last land green, and what changed since?
- `git log -p --since=<last-known-green> <paired-artifact-path>` — any paired artifact (OAS YAML, generated TypeScript types, fixture graph, lock file) that the test asserts against may have drifted from its source without regen.

Run UI-1 Impl shipped at 1,152 + "OAS drift known flake"; QA dug in + found the real cause was TE-1's docstring repair (`Pat-locked` → `D-DB-INDEX-NOT-CONTENT` in `TeamArchetype`) never paired with `openapi.yaml` regeneration. 5-minute investigation would have caught it pre-ship. The "known flake" framing short-circuits investigation — treat it as a stop-word, not a pass-through.

**Absorbing a mid-pipeline amendment without stashing.** If Spec amends the spec mid-run and Impl has uncommitted pre-draft edits in the working tree, do NOT `git stash` (see Cross-worktree CWD discipline). Instead:

```bash
# Pull just the spec amendment, keep working-tree edits intact:
git checkout feat/<slug> -- docs/specs/<spec-file>.md
git reset --soft feat/<slug>   # fast-forwards HEAD; staged edits remain in index, working tree untouched
```

The `checkout -- <path>` form pulls a single file from the target branch into the working tree without touching anything else. The `reset --soft` then fast-forwards HEAD to feat-tip, preserving your staged + unstaged edits. Validated on Run U and Run V. See `feedback_amendment_fast_forward_pattern.md` and `feedback_mid_pipeline_amendment_recipe.md`.

## Stage carve discipline

When the spec has explicit staging in § 5 ("Stage 1: extract X. Stage 2: rename Y. Stage 3: add Z."), the stages are a contract between Spec and Impl. **At stage 0 (before stage 1), paste the stage list verbatim into your working notes** so you have an unambiguous reference as you work. Do not silently fold two stages into one — the staging is usually load-bearing for verification (each stage gives QA an independent gate). If you discover during stage N that folding stages N and N+1 is genuinely better, escalate via `message_type="question"` to Spec; do not fold unilaterally.

## Incremental carve discipline (mechanical refactors)

For mechanical refactors that split one file into N (or move a concrete subsystem from A to B), **carve one piece at a time with tests between each step.** Never one-shot the whole transformation. Debugging a global "everything broke" failure costs more than the script saves on small N. The pattern:

1. Move one symbol (or one logical group of symbols) to its new home.
2. Update imports that referenced it.
3. Run the focused test that exercises that symbol; if green, commit.
4. Repeat for the next symbol.

Scripts are fine when one invocation = one carve unit (one symbol moved, one import path rewritten). Avoid scripts that try to do the whole rename in one pass — they encode assumptions you haven't validated, and the rollback cost on failure is high.

## Baseline measurement at feat-tip

Before touching any source file, measure the baseline yourself to confirm spec § 2 is accurate at the current feat-tip:

```bash
docker exec convo-impl-backend-1 uv sync --group test
docker exec convo-impl-backend-1 uv run pytest -n auto --tb=no -q
docker exec convo-impl-backend-1 uv run pyright .
```

Compare the literal output to spec § 2's BASELINE-FROZEN block. If they differ, stop and ping Spec — inter-run merges (librarian passes, non-feature commits) drift the numbers silently, and the spec's gates may no longer be achievable. Cheaper to discover before the edit cycle than after.

**Always run pyright from inside the container at the `/app` WORKDIR**, never by `docker cp`-ing the tree to a scratch path. Different `sys.path` resolution inflates error counts. See `feedback_pyright_container_methodology.md`.

**Always `uv sync --group test`** before the first pyright run after a container rebuild — the test group installs ~64 test-only dependencies that pyright sees as unresolved imports otherwise. See `feedback_uv_sync_test_before_pyright.md`.

**Proactive `--no-cache` rebuild between runs that touch `backend/core/` OR `scripts/`.** The Impl and QA stacks drift from each other's pyright baselines because the Impl container caches older backend source layers from Docker build cache while QA's stack gets rebuilt more often (as part of `stack-reset` during verification). QA stays aligned with main; Impl quietly accumulates stale layers until the delta becomes noise at baseline alignment. When Impl's baseline measurement (above) reveals pyright drift from main vs QA's container — typically showing as pre-existing errors in `scripts/` files that don't exist on main — **post a `message_type="stack_request"` to QA at run start (right after comms test, BEFORE spec work lands).** Flagging at git-request time is too late — the run has already shipped past the rebuild window. Rebuild scope extends to any run touching `backend/core/` OR `scripts/`, not just arch-class runs; otherwise Impl's container pyright counts stay stuck at the pre-rebuild state run-over-run.

Rebuild recipe (Impl runs, OR asks QA via stack_request to coordinate):
```bash
cd /workspaces/convo/.worktrees/implementation
docker compose -p convo-impl --env-file .env.impl build --no-cache backend
docker compose -p convo-impl --env-file .env.impl up -d
docker exec convo-impl-backend-1 uv sync --group test
```

`uv sync --group test` is required after `--no-cache` (runtime deps only ship with the base build — test-group deps inflate pyright by ~64 errors until synced, per `feedback_uv_sync_test_before_pyright.md`). Validated across R6, R7, Phase 2, Phase 3, and mentions-fallback-matcher retros — the pattern "Impl notices the 2 errors, flags in git-request, QA passes anyway, drift doesn't self-heal" recurred until Impl shifted to proactive stack_request at run start.

**Adding a new Python runtime dep mid-run requires `docker cp + uv sync`.** The impl/qa docker containers bind-mount source directories (`api/`, `bridge/`, `core/`, etc.) from the worktree, but `/app/pyproject.toml` is **NOT** bind-mounted — it's baked into the image at build time. When a spec adds a new runtime dep to `backend/pyproject.toml` (e.g. `boto3` on Run S), a bare `docker exec convo-impl-backend-1 uv sync --group test` will read the container's stale pyproject.toml and install nothing new. The fix:

```bash
docker cp backend/pyproject.toml convo-impl-backend-1:/app/pyproject.toml
docker cp backend/uv.lock convo-impl-backend-1:/app/uv.lock
docker exec convo-impl-backend-1 sh -c 'cd /app && uv sync --group test'
```

This copies the new pyproject.toml + lockfile into the container, then runs uv sync against them. Installs resolve the new dep into the container's venv without a full image rebuild. Include the same three commands in the merge request body so QA runs them on their container before verification — QA's container has the same bind-mount topology and will fail identically otherwise. A full stack rebuild (`docker compose up -d --build`) would also pick up the new dep, but is overkill for a single-file dep change.

**`--force-recreate` wipes the container-side venv — repeat the cp + sync after.** When a spec also adds a new compose mount (or anything else that requires `--force-recreate` to take effect), the recreate step throws away the venv that was just populated by the cp+sync. Sequence: edit pyproject + compose → cp pyproject + uv.lock → uv sync → `--force-recreate` → cp pyproject + uv.lock AGAIN → uv sync AGAIN. Validated on Run W where stage 1 added both `pyyaml` and a `./docs:/app/docs:ro` mount; the second cp+sync round-trip was required. A plain `docker restart` doesn't pick up new mounts, so `--force-recreate` is the right tool, but it costs an extra dep-install pass.

**Import-chain deps: go straight to `up -d --build`, skip the cp+sync path.** The cp+sync workflow assumes the container is exec-able long enough to run the sync. If the new runtime dep is imported at container start (e.g., `boto3` when `MOOTUP_STAGE` triggers `_load_aws_config()` on import) AND the compose env was also changed so the import path now exercises the new dep, the container crashes on first import, restarts, crashes again — no stable exec window for `docker cp`. Diagnose by checking whether the new dep is on the `backend/core/config/config.py` or equivalent startup-import chain: if yes, go straight to `docker compose -p convo-<role> --env-file .env.<role> up -d --build`. The rebuild pulls pyproject + uv.lock fresh, installs the dep before the container ever imports, and crashes are avoided. Reserve cp+sync for test-time-lazy deps (pytest plugins, import-on-demand libraries). Validated on Run AB where `boto3` + new `MOOTUP_STAGE=local` put the container in a crash-restart loop and rebuild was the only stable path.

## Cross-worktree CWD discipline

In a multi-worktree repo, `cd other_worktree && git commit` can silently land work on the wrong branch. Rules:

- **Never `cd` inside a chained git mutation.** Use `git -C <path>` instead, or split into separate commands.
- **Verify current branch before destructive ops:** `git branch --show-current` before any `git merge`, `git reset --hard`, or `git checkout --`. Especially after compaction or cross-repo context switches.
- **For cross-repo runs (e.g. mootup-io/moot):** `cd /workspaces/convo/mootup-io/moot/.worktrees/implementation/` at the start of every handoff and stay there for the duration. Never slip back to convo paths mid-chain. Every git command, every `uv run`, every file write operates relative to the cross-repo worktree. Validated across Run Q and Run R.
- **Convo-primary runs that touch a sibling repo: same rule applies, per touched repo.** When a convo-primary run also edits files in `mootup-io/moot/` (e.g., bundling a skill into the moot template), those edits MUST land in the moot-cli impl worktree on `impl/<slug>` — NOT in the host clone of `mootup-io/moot/`. The host clone of any repo stays on main; every cross-repo edit creates or pulls the corresponding `impl/<slug>` branch in that repo's worktree first. Run Z had Impl initially write moot-cli changes to the host clone (on main), then reset and re-commit in the impl worktree — costs a recovery cycle that's avoidable with the explicit rule "any edit to `<repo>/` goes in `<repo>/.worktrees/<role>/` on `<role>/<slug>`, regardless of which repo owns the feature."
- **The host worktree always stays on main** (per repo). Leader creates feat branches with `git branch`, not `git checkout -b`, to preserve this invariant. Impl never touches main directly.
- **Never use `git stash` in multi-worktree workflows.** `.git/refs/stash` is shared across worktrees, so a stash created from one worktree can be silently popped onto another, losing or corrupting work. **4 confirmed incidents** (A-1 Impl being the latest — `git stash -u` + cross-dir `git checkout local/main -- .` mid-Q-gates overwrote working tree; recovered via `git stash pop stash@{0}`). The failure mode is momentary amnesia under pressure (investigating a baseline discrepancy; needing a quick "snapshot"; reaching for `stash` by muscle memory). **If you're about to type `git stash`, do one of these instead:**
  - **Single file retrieval:** `git show HEAD:<path> > /tmp/saved` (read-only snapshot; no branch mutation).
  - **Full snapshot:** `git worktree add /tmp/scratch <branch>` then `cp -r` or `diff` between trees (isolated from your worktree's state).
  - **Mid-flight commit:** `git checkout -b wip/<slug> && git commit -am "wip"` (preserves working state in git history; `git checkout -` returns; reset / amend when done).
  - **Cherry-pick onto scratch:** if you want to try applying recent commits elsewhere, cherry-pick into a throwaway branch instead of stashing working tree.
  Having the alternatives adjacent to the rule shortens the pivot when you reach for `stash` without thinking.
- **Post-recovery verification (after any cherry-pick, revert, or reset).** Run three commands before declaring recovery complete: (1) `git -C <source-worktree> status` to confirm source state, (2) `git -C <target-worktree> show HEAD --stat` to confirm what landed, (3) `git -C <target-worktree> log --oneline -5` to confirm history shape. Full pytest passing is NOT a recovery verification — a partial recovery can pass tests while leaving silent damage.

See `feedback_cross_worktree_git_mutations.md`, `feedback_host_worktree_always_on_main.md`, `feedback_check_branch_before_merge.md`, `feedback_worktree_stash.md`, `feedback_recovery_verification_discipline.md`.

## Multi-edit file hygiene

When editing a file with 3+ changes in one impl session, **prefer one `Write` call with the final content** over chaining `Edit` calls. Run R hit "file modified since read" twice on `README.md` because chained edits tripped the staleness check (likely a pyright-watcher mtime update between edits). Writing the final state once avoids the reparse dance and is faster.

For 1-2 changes, `Edit` is fine. For surgical changes inside a large file, `Edit` with wide context is still right. The rule is scoped: multi-edit sessions on a single file.

**Read-before-parallel-Write discipline.** When firing N≥3 Write/Edit tool calls in one parallel batch, every target file needs an explicit `Read` earlier in the conversation, NOT a partial Read via `ls` / `head` / `grep`. Run AA's Impl staged two files (`settings.json`, `.devcontainer/launch-agent.sh`) as Read-misses because the parallel batch fired writes without per-target Reads first. Symptom: tool errors mid-batch saying "file has not been read yet." Fix: before composing the parallel batch, walk the target list and ensure each file has been touched by a `Read` call (or, for new files, that the Write is unambiguously the file's first operation in the session).

## Subagent delegation for routine work

Impl is the pipeline's highest-cost agent by token spend — Opus running long context through an edit cycle. For routine, well-specified work, **delegate to Sonnet 4.6 subagents via the `Agent` tool** instead of editing in the main session. Full rule and examples in CLAUDE.md § "Subagent delegation (token cost)". Summary:

- **Good fits:** independent-files-same-rule fan-out (N ≥ 4) — skill transforms, brand sweeps, per-file migrations. Read-heavy research — grep-and-report, "how is this used."
- **Bad fits:** sequential edit chains, tests requiring composite state, spec re-interpretation.
- **Briefing discipline:** byte-identical briefings for parallel fan-out; post-merge consistency review before committing.

Run R's 7 skill transforms took ~40 min serial; the pattern would have been ~8-10 min with 7 parallel Sonnet subagents. Worth the judgment call when the shape fits.

## Idempotency + conflict-disambiguation idiom (canonical)

**Pattern codified after 3 consecutive runs using it** (TE-2 archetype-version, TA-1 UniqueViolation refetch, TA-2 post-compact conditional UPDATE). When a backend route implements "first write wins" + must disambiguate 404 / 403 / 409:

1. **Conditional UPDATE** with `RETURNING`: `UPDATE <table> SET <cols>, <idempotency_col> = NOW() WHERE id = $1 AND <idempotency_col> IS NULL RETURNING ...`.
2. **On 0 rows returned:** the row may not exist (404), exist but be owned by someone else (403), or already have the idempotency column set (409). A second SELECT by id disambiguates:
   - No row → raise `ValueError("not_found")`.
   - Row exists but tenant/agent mismatch → raise `ValueError("access_denied")`.
   - Row exists + idempotency column set → raise `ValueError("already_paired")` (or equivalent).
3. **Route handler maps** `ValueError` code strings to HTTP status (404 / 403 / 409) + response body.

Template (TA-2 `update_post_compact`):

```python
async def update_post_compact(pool, archive_id, actor, summary, at, token_count):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE transcript_archives "
            "SET post_compact_summary = $2, post_compact_at = $3, post_compact_token_count = $4 "
            "WHERE id = $1 AND post_compact_at IS NULL "
            "RETURNING id, tenant_id, agent_id",
            archive_id, summary, at, token_count,
        )
        if row is None:
            # Disambiguate
            existing = await conn.fetchrow(
                "SELECT tenant_id, agent_id, post_compact_at FROM transcript_archives WHERE id = $1",
                archive_id,
            )
            if existing is None:
                raise ValueError("archive_not_found")
            if existing["tenant_id"] != actor.tenant_id or existing["agent_id"] != actor.actor_id:
                raise ValueError("access_denied")
            raise ValueError("already_paired")
        return row
```

Saves ~5-10 min of Impl-time design on each new idempotent endpoint. Apply whenever the shape is "create-or-update with first-wins semantics."

## Pre-format-at-authorship for Python files

When authoring or editing backend Python files, run `black <file>` as part of the authoring pass (before Q-gates), not as a pre-commit afterthought. 4 consecutive runs have surfaced late-stage reflow passes (A-1, A-2, C-1a, and one prior); muscle-memory signal is strong enough to codify. Zero-cost discipline; eliminates "rebase on black reflow" retro bullets.

## `git diff --cached --stat` MUST run between `git add` and `git commit` (invariant)

Between staging files and committing, run `git diff --cached --stat` and verify the file list matches the spec's § 4 enumeration. `git add -A` and `git add .` MUST NOT be used for feature commits — they grab stale index state (`.claude/transcripts-pending-post/*.json`, `test-results/.last-run.json`, uncommitted worktree artifacts) and inflate the diff.

Discipline: enumerate file paths from the spec's § 4 list explicitly, then `git add <path1> <path2> …`, then `git diff --cached --stat`, then `git commit`. If the stat shows anything the spec doesn't enumerate, soft-reset and re-stage.

Third recurrence of stale-index pattern in three consecutive runs promoted this to invariant-grade: DS-3 near-miss (Leader caught at pre-squash), DX-1 near-miss (Leader caught at pre-squash), reconciler-gate self-catch (Impl caught at `git diff --cached`). Self-catch is correct; the habit is the load-bearing discipline. The repeated-across-three-runs shape shows the pressure is structural, not individual.

## Pre-commit operator-name self-check

Before `git commit`, grep the staged source files for operator-name references in durable artifacts (comments, docstrings, SQL comments, identifiers):

```
git diff --cached --name-only | xargs grep -nE 'Pat-locked|per Pat|Pat said|Pat approved|Pat-resolved|Pat-confirmed|Pat-direction' 2>/dev/null
```

Any hit is a candidate for scrub per CLAUDE.md's operator-identity-in-artifacts rule. Substitute with the D-decision ID from the spec (`Pat-locked "DB index, git content"` → `D-DB-INDEX-NOT-CONTENT`) or a neutral paraphrase ("design decision:"). Spec source blocks inherit narrative prose during drafting and operator-name references ride into Impl's paste without scrubbing unless explicitly audited. Run TE-1 landed 3 sites (`TeamArchetype` docstring + 2 SQL comments) that QA had to repair at commit `6075765`. Mechanical 10-second grep at commit time catches the recurring class. Pairs with spec-checklist's matching rule at SPEC-READY (Spec's grep is the first firewall; Impl's grep is the second).

## `uv.lock` regen paired reformat

When `uv.lock` regen bumps a formatter version (black N → N+1, ruff M → M+1), include the paired `uv run black .` (or `uv run ruff format .`) in the SAME commit. Unpaired bumps leave a drift landmine for the next sub-run's Impl: their `black --check` (Q6 gate) against the new formatter flags N pre-existing files, blowing their diff scope with a reformat-to-satisfy pass and potentially dropping `# type: ignore` comments out of their intended target lines (producing pyright errors requiring per-line suppression restoration). Document the reformat count in the commit message ("70 pre-existing files reformatted for black 26.3.1") so reviewers don't mistake it for scope creep. Symmetric for npm/yarn lock regens that bump prettier/eslint. Run TE-1 absorbed 70 files of pre-existing drift because convo's `66cdb9d` (uv.lock regen) shipped unpaired — cost ~15 min reformat + 12 type-ignore restorations.

## Cross-mount-boundary invariants need a host-side companion

When an invariant test asserts file existence across the `docs/` or other host-only directories (not in `backend/` or `frontend/src/` bind-mount), split the test into:
- **(a) container-visible half** — pytest asserts the bits visible from inside the impl/qa backend container (e.g., handler files grep for doc-path references).
- **(b) host-only half** — shell or CI asserts the bits only visible from the host (e.g., `docs/reference/<name>.md` file exists).

CP-1's R8 "protocol doc exists + handler files reference it" tripped this: `docs/` is NOT bind-mounted into `convo-impl-backend-1`; pytest can grep handler source files (bind-mounted) but can't check `docs/reference/control-plane-protocol.md` existence. Impl split into pytest-handles-grep + host-checks-doc-exists. Reusable pattern for any invariant that spans the `docs/` ↔ `backend/` boundary.

## Flag search_path-affecting store changes in merge handoffs

When Impl switches a store function from raw `pool.acquire()` to `tenant_conn(pool)` (or vice versa), explicitly call out in the merge-request text: "search_path scope changed: `<function>` now runs inside `tenant_conn`." QA needs this for tenant-isolation verification; it's not obvious from a line-level diff summary. TA-3 Impl swapped `create_archive`'s pool-acquire pattern without noting it; QA caught the change only via code review. 30-second discipline at commit-message time; pairs with the existing "deviations summary" convention.

## `conn: Any` for store functions that accept PoolConnectionProxy or Connection

When a store function might receive either the raw `asyncpg.Connection` or a `PoolConnectionProxy` (from `pool.acquire() as conn:`), annotate `conn: Any` to bypass pyright's type-narrowing. Pyright complains `PoolConnectionProxy is not assignable to Connection` otherwise. Pattern is established in the codebase; was previously tribal knowledge. Template:

```python
async def <store_fn>(conn: Any, ...) -> T:
    ...
```

TA-3 hit this on 3 store functions before the fix landed. Apply at authoring time for any new store function with the "takes either shape" pattern.

## Handing off to QA

When source edits + tests + baselines are all green, post a `message_type="git_request"` **reply in the feature thread** (not top-level) asking Leader to merge `impl/<slug>` → `feat/<slug>`. The merge request body includes:

- Source and target branch names
- Gate results: literal pytest/pyright output compared against spec § 2 baseline and § 14 targets
- End-to-end smoke results if spec § 14 specifies them
- Files changed (count + list)
- Spec deviations, if any, with a one-sentence rationale per deviation
- What's out of scope that was touched (should be empty; if not, escalate)

After posting the merge request, **stop**. Do NOT poll, do NOT ping QA, do NOT re-verify. Leader will merge; QA takes over on its own. Update your status to "idle, awaiting next feature" and wait for the next channel notification. See `feedback_no_poll_after_handoff.md`.

## Common test infrastructure gotchas

- **Python stdlib name-collision in `tests/<top>/<name>/` subdirs.** When Impl creates a new `tests/<top>/<name>/` subdir and `name` matches a stdlib module (`email`, `json`, `os`, `sys`, `types`, `collections`, `logging`, `pathlib`, `dataclasses`, etc.), do NOT create `__init__.py` in that subdir. Creating it triggers pytest `ModuleNotFoundError: No module named '<name>.test_<foo>'` because rootdir-based discovery walks the nearest-ancestor-`__init__.py` chain and binds the subdir to top-level, colliding with the stdlib module. Fix: omit `__init__.py`; pytest falls back to file-based discovery via rootdir conftest. Other `tests/core/*` subdirs work with `__init__.py` because their names don't collide. AE-1 hit this on `tests/core/email/`. Spec-side mirror rule in spec-checklist covers this at draft time; if spec missed it, Impl skips the `__init__.py` + flags in merge-request as a deviation.
- **`asyncpg` datetime parameters must be Python `datetime` objects, not ISO strings.** asyncpg does not coerce strings to timestamptz. See `feedback_asyncpg_datetime.md`.
- **pytest-xdist under subprocess:** if a test subprocess-execs a script that imports `core.config`, forward `PYTHONPATH=/app`, `POSTGRES_DB=<worker_db>`, and any other per-worker config vars in the subprocess env. In-memory config mutations don't cross process boundaries. See `feedback_subprocess_under_xdist_env_forwarding.md`.
- **FK cascade in test cleanup fixtures:** enumerate all FK-dependent children in dependency order, or use `TRUNCATE ... CASCADE`. Spec should have grepped `REFERENCES <parent>(id)` at draft time; if it didn't, the cleanup fixture may silently fail as xdist redistributes tests. See `feedback_fk_cascade_in_test_cleanup_fixtures.md`.
- **Agent actor fixture:** `actor_store.insert_actor(actor_type="agent")` needs `sponsor_id=`, NOT `email=`. Copy the pattern from `test_response_profiles.py`.
- **`pytest.addfinalizer` for route-registration teardown in tests that mutate `api.app.app`.** Tests that dynamically register routes on the global FastAPI app (e.g., probe-route tests in `test_observability_b1.py`) must tear down via `request.addfinalizer(lambda: api.app.app.routes.pop(...))` (or an index-based alternative). Without teardown, the routes persist in the pytest worker process and leak into downstream tests — most notably `test_openapi_drift.py::test_openapi_yaml_matches_fastapi_app` which scans `app.routes` for drift. Under `pytest -n auto` the leak is non-deterministic per-worker; test failures look like flakes. The fix is 1–2 lines per probe test; mechanical. Run B-2 landed this fix for B-1's OAS-drift flake via `addfinalizer` route-teardown.
- **`_StubRequest` in-process test-fixture stubbing over subprocess for teardown-discipline tests.** When a spec offers "subprocess `pytest.main([...])` OR direct function-call with a stub request object" for proving teardown-discipline, the in-process path wins unless the test genuinely needs a fresh import graph. Pattern template:
  ```python
  class _StubRequest:
      def __init__(self):
          self.finalizers: list[Callable] = []
      def addfinalizer(self, fn):
          self.finalizers.append(fn)

  async def test_probe_teardown():
      stub = _StubRequest()
      await register_probe_routes(stub)
      # ... assertions while routes are live ...
      for fn in stub.finalizers:
          fn()
      # ... assertions after teardown ...
  ```
  Avoids subprocess overhead + xdist cross-worker issues + fresh-import-graph complexity. Validated on B-2 B4.
- **`asyncio.create_task` requires explicit retention to survive GC.** Any fire-and-forget `asyncio.create_task(...)` must retain the returned task in a module-level `_pending_tasks: set[asyncio.Task]` with a done-callback to discard. Without retention, the returned task is weakly referenced by the event loop and may be garbage-collected mid-run — the body of the task silently never runs, or runs partially before GC interrupts. Symptom: a debounced operation "randomly" doesn't fire; tests that rely on the side-effect of the background task fail 50/50 under load. Pattern template at module scope:
  ```python
  _pending_tasks: set[asyncio.Task] = set()

  def schedule_fire_and_forget(coro):
      task = asyncio.create_task(coro)
      _pending_tasks.add(task)
      task.add_done_callback(_pending_tasks.discard)
  ```
  Run AH-f Impl caught this on first B1: the debounced flip task disappeared before its `sleep(0.5)` returned. Applies to any `asyncio.create_task` whose caller doesn't `await` the task inline.
- **xdist shared-Redis + `SCAN(prefix:*)` sweep = cross-worker state wipe.** Tests that drive reconciler-style sweep logic that `SCAN`s a global Redis keyspace (e.g., `mcp:connected:*`) under `pytest -n auto` touch state created by parallel-worker peers, wiping their SADD/SREM entries and breaking the cross-worker tests non-deterministically. Rule: background-sweep tests EITHER isolate to their own `actor_id` (use a dedicated prefix for the test) OR (preferred) exercise the per-item action directly (e.g., call `on_mcp_close(session_id, reason=...)` rather than `reconciler.sweep_once()`). The per-item path is what the sweep loop calls internally; testing it directly both avoids cross-talk AND produces faster / less flaky tests. Run AH-f B9 rewrote to the per-item path after the full-sweep version wiped parallel-worker B5 agents' SADD entries.
- **`admin_key` fixture has session-wide xdist blast radius.** The `admin_key` session-scoped fixture is consumed by `test_admin_bootstrap.py`, which performs `DELETE FROM users WHERE is_admin = true` in its cleanup. Tests in other files that reuse `admin_key` under `pytest -n auto` may see their admin user truncated mid-session by a parallel worker, surfacing at test setup as `AssertionError: Actor has no tenant` (or similar) on random runs. Fix: for tests that need a tenanted-human identity (not specifically admin privileges), create a local fixture at the test-file scope that mints a non-admin tenanted user per session — e.g., `install_admin_key` at `tests/api/test_installations.py` scope. Reuse `admin_key` ONLY when the test actually exercises admin-specific routes. Run AH-e-bootstrap-backend hit this on 5/11 install tests until the local fixture landed.
- **`admin_key` fixture creates a TENANT-LESS admin.** Separate from the xdist-cleanup issue above: the admin actor that `admin_key` mints has NO tenant membership. Silent failure mode: queries that filter by `WHERE tenant_id = $N` return 0 rows for a tenant-less admin's `None` parameter. Tests that need tenant context pick one of two paths: **(a) seed resources with `published_by='mootup'`** (or equivalent global-namespace sentinel) to exercise the `is_admin` bypass path, OR **(b) use `_redeem` + `update_actor_admin`** for a tenant-bound admin. TE-2's B1 first attempted to resolve `admin_key`'s tenant via `SELECT tenant_id FROM agents WHERE is_admin` — wrong table (`is_admin` lives on `users`; agents have `is_system`) AND wrong semantic (admin is tenant-less by design). Cost ~5 min. Also: if the route you're testing has admin-bypass logic, path (a) exercises the interesting authorization flow directly.
- **Phase D route-mechanics smoke for path-param + admin-bypass routes.** When § 6 drop-ins involve path-param routing (especially with `/`-containing IDs like `mootup/loop-4`) OR admin-bypass auth chains (tenant-optional paths), pre-test the happy path with a sample `httpx.AsyncClient` call before writing tests. ~30 seconds of discipline; catches FastAPI-mechanics issues (default `{id}` converter rejects `/`, tenant_id gate misplacement, SQL-parameter `None` leakage) that would otherwise surface during Q-gate test runs and cost ~5 min each. TE-2 Impl hit 3 such deviations (all non-semantic, all would have surfaced in one smoke call): `{archetype_id:path}` converter needed, `tenant_id is None` gate in wrong branch, `__no_tenant__` sentinel for SQL.
- **`aioredis.Redis` typed binding confuses pyright on awaited methods.** When a new handler awaits `aioredis.Redis` methods (`scard()`, `sadd()`, `smembers()`), declaring the local `redis_client: aioredis.Redis = registry._redis` makes pyright see `scard()` as returning `int` instead of `Awaitable[int]` — the async stubs lag runtime. Fix: use `Any` at the local binding, matching `connection/service.py`'s `redis: Any` precedent. Runtime is unchanged; pyright stops complaining. A-2 `GET /api/actors/{actor_id}/session-count` hit this; `registry._redis: aioredis.Redis | None = ...` at module scope is fine but handler-local rebinding should be `Any`.
- **Frontend pure-logic split (2-for-2 pattern).** When a function takes only primitives and returns a display enum (A-1 `toastSeverity.ts` → `toastSeverity`; A-2 `dotColor.ts` → `inferDotColor`), extract it to a non-reactive `.ts` module (NOT `.svelte.ts`). Vitest runs the pure function cheaply without Svelte runtime; components depend on the pure function for display logic. Rule is now 2-for-2 across frontend-primary runs; apply whenever the function signature is `(...primitives) => <DisplayEnum>`. Tested in isolation via plain `vitest` import; no `@testing-library/svelte` mount needed.
- **FastMCP `call_tool` runtime return shape:** returns `tuple(content, dict)` despite the declared type. Branch on `isinstance` in test helpers.
- **Token literals in test bodies:** import prefixes from `core.auth.tokens` (`API_KEY_PREFIX`, `SESSION_COOKIE_NAME`), never hard-code `convo_key_` / `convo_sess_` / `sk_`. An arch invariant rejects raw literals.
- **Cross-module monkeypatch indirection.** When module B does `from module_a import some_func` and `some_func` calls a helper resolved from module_a's globals, patching `module_b.helper` is a no-op — `some_func` looks up `helper` in module_a, not module_b. Symptom: "test passes but the patched code path doesn't seem to execute." Fix: patch `module_a.helper` directly, OR patch the imported alias (`module_b.some_func`) one level higher. Run T spec drop-ins had this in 3 places — Impl pivoted to patching `lc._session_exists` directly. See `feedback_cross_module_monkeypatch_indirection.md`.
- **`shlex.quote` doesn't quote shell-safe identifiers.** `shlex.quote("moot-spec") == "moot-spec"` (no surrounding quotes — hyphens are shell-safe). Tests asserting wrapped-quote literals around simple identifiers will fail. The protection still holds — shell-safe input doesn't *need* quoting; the function is a no-op there. To exercise actual quoting, use input with a metacharacter (`"role; rm -rf /"`). See `feedback_shlex_quote_hyphenated_identifier.md`.
- **`list[dict[str, object]]` capture patterns trip pyright on subscript reads.** When mocking a callable that takes heterogeneous args, prefer parallel typed lists (`captured_args: list[list[str]]`, `captured_env: list[dict[str, str] | None]`) over a single `list[dict[str, object]]`. Pyright sees `captured[0]["args"]` as `object` and refuses `[:2]` slicing — adds 5 errors to the count for one test. Parallel typed lists or a `TypedDict` keep reads pyright-clean without `cast`. See `feedback_pyright_object_subscript_in_test_captures.md`.
- **`__pycache__` orphans after `git mv`.** Renaming or moving a Python package via `git mv` leaves the old `__pycache__/` directory as untracked debris. Clean before `docker compose build` or it gets baked into the new image and confuses imports. Run `find backend -name __pycache__ -type d -exec rm -rf {} +` before a stack rebuild that follows a package rename.
- **httpx Secure cookies need `https://test`.** httpx test clients with `base_url="http://test"` silently drop cookies that have the `Secure` attribute. If your test follows a Secure-attributed session cookie (most session auth), use `base_url="https://test"` — http:// causes the cookie to be set in the response but not echoed in the next request, and the test passes for the wrong reason.
- **Backend process caches routes; restart after checkout.** uvicorn caches the route table at startup. After `git checkout` in the QA or Impl worktree, run `docker restart convo-<role>-backend-1` before any pytest or curl that targets new/changed routes — otherwise tests run against the previous code.
- **Container paths omit `backend/` prefix inside `docker exec`.** The backend container's WORKDIR is `/app`, and the compose bind-mount maps the worktree's `backend/` directory onto `/app`. So `backend/tests/api/test_api.py` on the host becomes `tests/api/test_api.py` inside `docker exec convo-<role>-backend-1 uv run pytest …`. A host-path invocation inside `docker exec` silently matches zero tests ("collected 0 items") rather than erroring. Translate spec paths at the container boundary. Same applies to `pyright <path>`, `black <path>`, and any other tool-invocation that takes a file path.
- **Pre-handoff black check on signatures that might split.** Black (88-char rule) collapses single-param-per-line function signatures to one line whenever they fit. Spec § 6 drop-ins occasionally show signatures in the split-line style `async def foo(\n    a: str, b: int = Depends(bar)\n) -> T:` even when the one-line form fits; Impl pasting byte-identical will trip QA's black gate. Two options: (a) run `black <target-file>` locally before handoff and commit the collapsed form; (b) flag the paste as a known black-collapse candidate in the merge message so QA's repair isn't framed as a deviation. Either is fine; pre-ship black is cheaper.
- **Module-accessor fixtures must cache their return value when the test mutates it.** When a test fixture patches a module-level accessor that returns a fresh instance per call (`find_config()`, `get_settings()`, `build_client()`, etc.), cache the single instance inside the fixture and return that same instance every time — don't build a new one per call. If the production code calls the accessor twice (once in the test setup, once inside the code under test) and the fixture hands out a fresh object each time, any in-test mutation on the first object is silently lost. Run AC caught this on `test_launch.py`'s `FakeConfig` fixture: in-test mutation of `agents["spec"]` was a no-op because `cmd_exec` re-called `find_config` and got an unmodified instance. Fix pattern: build the instance once in the fixture, yield it, close over it in the patched callable. Generalizes the Run S subprocess-env-forwarding rule from env-var space into Python-object space.

## Playwright in the impl worktree

Playwright's default `baseURL` is `http://localhost:5173` — that's the *host* stack's Vite dev server, NOT the impl worktree's. For impl-side self-smoke, spin a preview server on a different port and pass it explicitly:

```bash
cd frontend
npm run preview -- --port 5174 &
PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test <spec>
```

Or skip self-smoke and hand off to QA, who runs against the QA stack on its canonical port. Validated when an impl smoke pass kept hitting the host stack and reporting stale results.

**Dev-mode Vite AND `vite preview` BOTH bypass `+server.ts` catch-all endpoints** (CORRECTED post-DS-3). When a feature ships a `+server.ts` endpoint, Playwright tests against either `vite dev` OR `vite preview` falsely green: both serve a SvelteKit client shell (status 200 + HTML content-type + non-empty body) for any path. Tests asserting those surfaces pass on the shell. **Only the docker-compose production server runs catch-all `+server.ts` handlers.** DS-2's earlier rule (this slot) recommended `vite preview` — direction-correct but remedy-wrong; DS-3 amendment-3 caught it after a wasted iteration.

**Correct pattern: route Playwright at the QA docker-compose stack** (port `5190` per `.env.qa`; runs SvelteKit production server with handlers):

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5190 npx playwright test frontend/tests/<spec>
```

For impl-side smoke before handoff: either spin the impl docker stack (`docker compose -p convo-impl up --build -d` and target the impl frontend port) or skip self-smoke and hand to QA. `vite dev` and `vite preview` are both unsafe for catch-all-route assertions.

**CSS-loaded-at-all probe before iterating on selector specificity.** When a CSS rule "doesn't apply," first probe whether the CSS *file* is loading at all. Add a sentinel rule at the top of the stylesheet under test:

```css
body { background: red !important }
```

Then in Playwright:

```javascript
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// If bg is rgba(0,0,0,0), the CSS file isn't loading. Fix file delivery, not the selector.
```

DS-3 wasted ~3 iterations on selector specificity before realizing the file itself was 404'd (F-DS3-ASSET-404-ON-308-REDIRECT). Sentinel-rule probe is ~10 seconds; selector iteration is ~5 minutes per cycle.

**Sphinx venv setup on host for docs-touching Playwright runs.** When a feature's Playwright assertions verify served HTML from `docs/site/_build/html/`, Impl's container lacks sphinx and can't `make html`. Host-side venv is the only path:

```bash
# One-shot docs venv (cleanup post-Playwright):
cd docs/site
uv venv .venv-docs
uv pip install --python .venv-docs -r requirements-docs.txt
.venv-docs/bin/sphinx-build -b html . _build/html
# after Playwright completes:
rm -rf .venv-docs
```

Works for both DS-1 state (committed `_build/html/`) and DS-2 state (operator-local `_build/html/`). Post-DS-2 this is mandatory for docs-site Playwright verification since the committed tree is gone.

## Instrument, don't theorize — when a candidate fix doesn't converge

When a prescribed fix fails empirical validation (ship gate, targeted test run, smoke probe), the next move is ALWAYS to instrument the failing path before proposing a design pivot or amendment. One round of per-step state dumps (Redis `SCARD` / `SMEMBERS`, event metadata, log tail, lifespan state, subprocess cmdline) is cheaper than one round of spec amendment + Product approval + Leader merge + re-verify (~30 min round-trip).

**AH-f-deflake Phase C** validated this discipline: after Amendment 1 (xdist_group) failed in serial pytest too, Impl added per-step `redis.SCARD("mcp:connected:*")` + `SMEMBERS` + event-metadata dump to a B4 test run. One instrumented run surfaced `reason='stream_drop'` with `transport='mcp_streamable_http'` — immediately pointing at `ConnectionReconciler._reconcile_mcp`. A direct DB-9 isolation probe (`docker exec -e REDIS_URL=redis://redis:6379/9`) returned 5/5 clean runs. Dispositive in ~10 minutes; an instrumentation-first response to Amendment 1's failure would have gone directly to the correct diagnosis without the xdist_group detour.

**Rule:** Phase B failure → Phase C instrumentation → diagnosis-backed amendment. Not Phase B failure → hypothesis pivot → next amendment. When Spec asks "what's happening?", answer with data, not theory.

## Black-check before R1 full-suite gate (multi-edit file hygiene)

After finishing Edit/Write operations on a file that passed through ≥2 edits, run `black --check <files>` (or equivalent formatter) before launching R1 test run. Multi-edit accumulation occasionally leaves Black-reformatting needs that only surface when the full-suite gate runs `black --check` as part of Q-gate. Saves ~3 min per cycle when it would have been a follow-up commit; trivial cost when clean. AH-f hit Black reformatting need at R4; a post-edits check would have caught at R1.

## Amendment-absorb fast-forward pattern

When mid-run spec amendments land on `feat/<slug>`, absorb them into `impl/<slug>` without stashing WIP:

```bash
git -C .worktrees/implementation fetch
git -C .worktrees/implementation checkout feat/<slug> -- <path1> <path2>  # pull specific spec-updated files
git -C .worktrees/implementation reset --soft feat/<slug>                   # rebase impl tip onto new feat
# review working tree, stage, commit as single impl commit
```

Validated on AH-f-deflake through 2 amendments; no stash dances, no WIP loss. Works when spec updates touch files Impl hasn't edited yet (common) or when Impl can re-apply edits atop the absorbed spec.

**For Playwright against the containerized impl/QA stack** (when the feature ships under the stack's frontend, e.g., SvelteKit routes serving from inside a container rather than `npm run preview`): read the frontend port from `.env.impl` or `.env.qa` and export `PLAYWRIGHT_BASE_URL` explicitly BEFORE running the test:

```bash
# Impl stack: FRONTEND_PORT=5180 per .env.impl
PLAYWRIGHT_BASE_URL=http://localhost:5180 npx playwright test frontend/tests/<spec>

# QA stack: FRONTEND_PORT=5190 per .env.qa
PLAYWRIGHT_BASE_URL=http://localhost:5190 npx playwright test frontend/tests/<spec>
```

Same root cause as the preview-port case (default `:5173` hits host stack), different workflow shape. DS-1 Impl + QA each hit this on first Playwright run before realizing the port default. Latent for any future Playwright-gated run.

## Pre-draft baseline-drift probe when spec § 2 quoted count is stale

When Impl pre-drafts during SPEC-READY hold AND spec § 2 baseline pytest-count was taken more than ~1 hour ago (e.g., baseline from a prior feature's ship commit that landed a while before Spec drafted), run `docker exec <backend-container> uv run pytest --collect-only | tail -1` on the feat-tip to detect silent drift. DS-1 shipped with 5-test drift (spec quoted 1,285 baseline from AE-3 ship; actual at feat-tip was 1,290 from intervening test-infra touches). Non-blocking but introduces small arithmetic confusion at merge-request time. 1-command probe at pre-draft; surfaces drift before the baseline claim lands in the merge message.

## Structural-invariant-change bidirectional grep in pre-draft (post CLI-1)

When spec § 8 changes a **structural invariant** (bin name, engines version, hardcoded version string in source, config field name, schema-version constant, etc.), Impl's pre-draft greps in BOTH directions:

1. **Test files for assertions on the OLD value** — e.g., `invariants.test.ts` asserting `expect(pkg.bin).toEqual({ old-name: ... })`. These are the tests that enforce the old invariant; they need updating in lockstep with the config change.
2. **Source files for hardcoded mirrors of the OLD value** — e.g., `src/bin.ts` with `.version('0.1.0-rc.0')` hardcoded alongside the `package.json` version field. Config values often have source-side copies that Impl must update in parallel.

Extension of the existing "Pre-draft grep for existing-test contradicting-assertions" rule — that rule covered behavioral test assertions; this extension covers structural-invariant tests AND hardcoded source mirrors. CLI-1's T9 test-file assertion + `bin.ts` `.version()` hardcoded string were both misses in the same class; the bidirectional grep at pre-draft catches them together.

Cost: one `grep -rn '<old-value>' test/ src/` per renamed symbol during pre-draft. Saves one Q-gate failure + one 1-line mechanical fix cycle.

## Self-smoke recipe dry-run in pre-draft (post CLI-1)

When spec § 7 prescribes a literal **install/run command for a self-smoke gate** (e.g., "Q8: `npm i -g --prefix /tmp/moot-test <tarball>` → `moot --version` prints expected"), Impl's pre-draft dry-runs the recipe on the **pre-edit** codebase to confirm it's mechanically sound.

This is distinct from whether the post-edit result meets the gate's semantic target. A recipe can be mechanically broken (wrong semver matching, wrong install path, missing dependency, unavailable binary) independent of what the gate is checking. Catching recipe-level bugs at pre-draft avoids discovering them mid-impl when the Q-gate first runs.

CLI-1's § 7.2 single-tarball install recipe failed because npm's `*` semver excludes pre-releases — `@mootup/moot-sdk@*` wouldn't resolve to the published `0.1.0-rc.0`. Impl discovered at first Q8 run; the 3-tarball workaround was correct but cost a diagnostic cycle. ~60s pre-draft dry-run catches it earlier.

If the recipe is broken: post the question to Spec (escalation channel, not an amendment yet — recipe bugs often have ≤5-line fixes Spec can apply before SPEC-READY re-issues).

## Q11 operator-name scrub — whole-file, per-file Grep invocations (post RL-1)

When an Impl Q11 scrub runs on files that existed before the run (append-only edits, single-function edits, or any non-new file), the scrub covers the ENTIRE file, not just the diff. Pre-existing violations in co-owned files are in-scope.

**Tool-invocation shape matters.** Do NOT use ripgrep brace-expansion in `Grep`'s `glob` parameter:

```
# WRONG — ripgrep does not expand brace-lists in glob; matches zero files
Grep(pattern="...", glob="{file1.py,file2.py,file3.py}")
```

Issue per file:

```
# CORRECT — one Grep call per target file
for f in <list>: Grep(pattern="<scrub-regex>", path=f)
```

RL-1's Q11 used the brace-glob form AND a "just my diff" mental scope. Both failed: the glob matched zero files (silent "No matches"), and the "just my diff" frame excluded a pre-existing `"per Pat's answer in evt_..."` at `test_architecture.py:1293` that Impl had appended to. QA caught it on whole-file scrub. Two lines repair; ~5 min avoidable.

Rule: per-file Grep invocations + whole-file scope. Mechanical, low-cost, short-circuits QA-side repair.

## Event-id from a compact summary is suspect — resolve before posting

CLAUDE.md carries "Stale event IDs after compact." Reinforcement from RL-1: Impl post-compact grabbed an event-id from its compact summary and posted a pre-draft ping to the wrong thread (ONB-1 instead of RL-1). Caught on `get_recent_context` cross-check; reposted correctly.

Mechanical rule: **ANY event-id whose source is a compact summary MUST be resolved via `get_recent_context` (or the live channel notification you actually received) before using it in `reply_to(event_id=...)` or similar.** Not "after compact generally" — any specific event-id sourced from a summary is suspect until verified.

Cheap to do: one `get_recent_context` call before the reply. Saves one misrouted post, the Leader-forwarding that usually has to catch it, and the thread-alignment confusion.

## Platform instability

Transient MCP/backend errors (502, 504, connection reset, timeout) are normal, not anomalies. One retry. If that fails, call `wait_for_health`. If still failing, post one status update ("backend unreachable, pausing work") and stop. Do not descend into diagnostic commands unless the outage persists past 2–3 minutes and is blocking something time-sensitive. See CLAUDE.md "Platform instability" section for the full rule.

## What Impl does NOT do

- **No design decisions.** Scope questions escalate to Spec as `message_type="question"` in the feature thread. Do NOT rewrite the spec mid-run or silently extend scope.
- **No main-branch git operations.** Leader owns main and feat branches. Impl operates on `impl/<slug>` only.
- **No QA work.** Impl writes common-case behavioral tests per spec § 7. QA extends coverage based on own analysis. Do not shadow QA's job.
- **No handoff acknowledgments.** When you receive a SPEC-READY handoff, update your status and start working. Do NOT post "acknowledged" in the thread. See CLAUDE.md "No handoff acknowledgments."
- **No direct Pat communication.** Strategic questions about scope, design, or team topology route through Product via `message_type="question"`.

## Defined terms

- **SPEC-READY** — the state at which Spec has merged `spec/<slug>` → `feat/<slug>` and handed off to Impl. Impl's work begins at this signal.
- **Pre-draft hold** — the window during Spec's drafting before SPEC-READY lands. Impl may pre-draft analysis (grep blast-radius, confirm line numbers, read target files) during this window; cap at ~5 min for mechanical specs.
- **§ 6 drop-ins** — code blocks in the spec that Impl pastes byte-for-byte into source files. Impl does not edit these creatively; edits beyond the drop-in are escalations.
- **§ 14 Q-gates** — spec-prescribed grep/test commands Impl runs at commit time to verify invariants before merge-request.
- **Impl home branch** — `impl/work`; resting state between feature runs.
- **Impl worktree** — `/workspaces/convo/.worktrees/implementation/`; all filesystem ops run here.
- **Impl stack** — `convo-impl` docker-compose project volume-mounted from the Impl worktree.

