---
name: memory-audit
description: Recurring audit of operator memory entries. Every fifth pipeline retro synthesis, the memory curator reviews accumulated feedback/project/reference entries and promotes team-generic rules to durable docs or skills, retires already-promoted entries, and keeps operator-specific state in memory. Invoked by the role that owns memory curation (typically Product).
---

# Memory Audit

## Purpose

Operator memory accumulates organically as pipeline retros land. Most entries are useful at the moment of capture but their durable home is uncertain — some describe team-generic rules that belong in CLAUDE.md or a workflow skill, some restate rules already documented elsewhere, and some are genuinely operator-specific state that should stay local. Without a recurring audit the memory directory drifts: promotion candidates go unpromoted, already-promoted entries become redundant, and staleness accumulates.

**Why it exists as a named skill:** the audit cadence (every fifth synthesis) and the three-criterion promotion rubric need to be applied consistently across cycles and curators. The skill encodes both so each audit produces a comparable artifact — the audit report — that future audits can diff against.

## Preconditions

- **Role:** the role that owns memory curation. In the default team topology, Product (who also owns retro synthesis and durable documentation). In topologies without Product, the role that edits CLAUDE.md and memory files.
- **Cadence gate:** git log shows ≥ 5 retro synthesis commits since the last `memory audit:` commit on main. If the count is less, the skill is a no-op for this invocation.
- **Main is current.** The curator's worktree has the current main tip so git-log grep commands run against complete history.

## Invariants

- **Topology invariance.** Audits may promote rules that change *how* individual roles perform their work; MUST NOT promote rules that change the pipeline topology (who talks to whom). Edge-adding or phase-crossing proposals are rejected at promotion time.
- **Three-criterion rubric is MUST.** A memory entry is a promotion candidate only if all three conditions hold: validated across ≥3 pipeline runs, operator-agnostic, describes a rule. Skipping any criterion produces spurious promotions.
- **Audit-closing commit subject starts with `memory audit:`.** The next cadence count depends on grepping git log for this prefix; other subjects break the anchor.
- **Retirement happens with promotion, atomic.** When a memory entry is promoted, the memory file is deleted in the same commit as the durable edit (or the immediately-next). Orphaned-in-memory-and-durable is the drift state.

## Postconditions

- Every memory entry has been classified into exactly one of (a) already-promoted-retire, (b) needs-promotion-draft-and-retire, (c) keep-in-memory, (d) retire-unconditionally.
- For (a) entries: memory files deleted; MEMORY.md index updated.
- For (b) entries: durable artifact edited with promoted text; memory files deleted; MEMORY.md index updated.
- For (c) entries: memory files updated if needed; left in place.
- For (d) entries: memory files deleted; MEMORY.md index updated.
- A product-facing audit report exists at `docs/product/memory-audit-<yyyy-mm-dd>.md` enumerating starting count, classification, and durable-doc edits.
- An audit-closing commit exists on main with subject starting `memory audit: …`.
- Audit reports older than three cycles are deleted (ratcheting).

## When to invoke

Every fifth pipeline retro synthesis, counted from the previous audit (or from the start of the repo's history if no audit has run yet).

The count is derived from the git log at invocation time; no counter state file is kept.

```bash
# Replace <repo> with the path to the repository (e.g. the main worktree).
LAST_AUDIT=$(git -C <repo> log main --grep="^memory audit:" -1 --format=%H 2>/dev/null)
if [ -n "$LAST_AUDIT" ]; then
    COUNT=$(git -C <repo> log "${LAST_AUDIT}..HEAD" main --grep="synthesis" --oneline | wc -l)
else
    COUNT=$(git -C <repo> log main --grep="synthesis" --oneline | wc -l)
fi
echo "retro-synthesis commits since last audit: $COUNT"
```

If `COUNT >= 5`, run the audit. Otherwise no-op. The `synthesis` grep matches retrospective synthesis commits whose subject follows `Run <label> synthesis — ...`.

## The three-criterion promotion rubric

A memory entry is a promotion candidate only if all three conditions hold:

1. **Validated across ≥3 pipeline runs.** A single-run observation is provisional; three runs establish the rule is real and the failure mode recurs. Two-run entries stay in memory pending validation or refutation.
2. **Operator-agnostic.** The rule applies to any team running this pipeline topology, not just to this operator or deployment. Test: would another operator running the same team template benefit from this rule? If yes, team-generic. If no, operator-specific, stays in memory.
3. **Describes a rule.** The entry is normative ("do X", "don't Y", "when X, then Y") not descriptive ("the current state is X" / "this commit fixed Y"). Descriptive entries are project state and belong in `project_*` memory regardless of how broadly applicable they might feel.

All three are required. Borderline entries stay in memory until the next audit cycle, when more data may resolve the ambiguity.

## Classification outcomes

| Bucket | Meaning | Action |
|---|---|---|
| **(a) Already promoted** | Rule exists verbatim or near-verbatim in CLAUDE.md, a workflow skill, or another durable artifact | Retire the memory entry (delete file + remove MEMORY.md index line) |
| **(b) Needs promotion** | All three criteria hold and no durable home exists yet | Draft promotion (new bullet / section / checklist item); retire entry in same or next commit |
| **(c) Keep in memory** | At least one criterion fails (operator-specific, single-run, descriptive) | Update entry if needed; leave in place |
| **(d) Retire unconditionally** | Stale (documents a fixed bug, references a defunct subsystem) | Delete with no promotion |

## Procedure

1. **Resolve the count.** Run the git-log snippet under "When to invoke"; confirm `COUNT >= 5`. If not, no-op and return.
2. **Enumerate entries.** Read `MEMORY.md`. For each file it links to, open the memory file and note its frontmatter `type` (user / feedback / project / reference).
3. **Classify.** For each entry, apply the three-criterion rubric and assign to (a), (b), (c), or (d).
4. **Confirm promotion targets.** For each (b) entry, identify the most-specific durable home:
   - Workflow skill for role-specific rules
   - CLAUDE.md for cross-role rules
   - `spec-checklist` for spec-authoring discipline
   - A new doc or skill if the rule spans an existing-doc boundary
   If no natural home exists, demote to (c) pending a future refactor that creates one.
5. **Draft promotions and retirements.** Edit durable artifacts to add promoted text. Delete corresponding memory files. Update `MEMORY.md` to remove retired index lines.
6. **Write the audit report.** Create `docs/product/memory-audit-<yyyy-mm-dd>.md` enumerating starting count, classification of each entry, and durable-doc edits made.
7. **Commit.** Subject line MUST start with `memory audit:`. Example: `memory audit: 2026-04-17 — retired 45 already-promoted, promoted 40, left 24 operator-specific`.
8. **Delete audit reports older than three cycles** (ratcheting — see Practice).

## Practice

**What NOT to promote:**
- **Operator identity, deployment specifics, local-environment constraints.** Operator-specific by definition.
- **Historical session records** (`project_session_*`). Provenance, not rules.
- **Stale bug-fix memories.** Documents a fixed bug → (d), no promotion.
- **Workflow-topology changes.** Edge-adding or phase-crossing proposals violate topology invariance; reject at promotion time regardless of how team-generic they feel.

**Audit-report ratcheting.** Keep the most recent audit report. Delete reports older than three cycles — they're no longer actionable and the durable-doc state has moved on. The most-recent report provides the diff baseline for the next audit; older reports clutter `docs/product/`.

**What success looks like.** A steady-state where (a) entries trend toward zero over several cycles — means retro synthesis is promoting candidates at the right cadence. (b) entries in the 0–5 range per cycle is healthy. (c) entries being the bulk of the memory file count is the goal — operator-specific state is what memory is for.

If (a) entries are persistently large across cycles, the retro-synthesis step is under-promoting during normal synthesis and the audit is compensating. Flag to the retro-synthesis role via `message_type="question"`.

## Defined terms

- **Retro synthesis commit** — a git commit whose subject follows `Run <label> synthesis — ...`. Counted by the cadence gate.
- **Audit-closing commit** — a git commit whose subject starts `memory audit:`. Anchors the next cadence count.
- **MEMORY.md** — the memory directory's index file at `~/.claude/projects/<cwd>/memory/MEMORY.md`.
- **Durable artifact** — a file outside the memory directory whose contents persist across sessions (CLAUDE.md, workflow skills, product docs, spec-checklist items).

