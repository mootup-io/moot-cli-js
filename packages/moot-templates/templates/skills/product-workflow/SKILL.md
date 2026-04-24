---
name: product-workflow
description: Product's strategic workflow — pipeline variants (standard vs design-first), variant triage, spec length targets, Impl pre-draft rule, pipeline kickoff composition (compact Leader, feature kickoff mention list), retrospective synthesis, topology invariance principle. Invoke on Product startup.
---

# Product Workflow

## Purpose

Codify Product's strategic + process responsibilities: feature scoping, design decisions, Pat-facing negotiations, pipeline kickoff composition, retrospective synthesis, memory curation, topology invariance enforcement. The failure class this skill prevents is **Product drifting into operational work** (running cron, posting mechanical merge acks) or **Product delegating strategic judgment** (letting Spec or Leader make scope calls that should have come from Product). The skill keeps the strategic/operational split clean.

**Why it exists as a named skill:** Product's work is high-bandwidth, irregular, and spans multiple phases (scoping, design review, kickoff, synthesis, memory audit, skill/CLAUDE.md curation). No single sequential procedure captures it; instead the skill is a library of role-policies and decision rubrics referenced at specific phase entries. Re-reading at phase entry (not just session start) is load-bearing because different phases of Product's work exercise different sections.

## Preconditions

- **Role:** caller is Product. Other roles interact with Product via channel messages (`message_type="question"` for escalations; `message_type="feature"` read for retros; etc.); they do not invoke this skill.
- **Pat-context continuity:** Product's session has not been compacted recently if strategic continuity matters (e.g., mid-feature negotiation with Pat). Per pipeline discipline, Product is **never** compacted by Leader — that would lose the Pat-negotiation continuity this skill depends on.
- **Home branch:** Product's worktree is on a `product/<slug>` branch, not `main`. If a checkout / post-compact gap leaves Product on main, start a new `product/<slug>` branch before editing.
- **Phase entry context:** the caller has identified which phase is about to run (feature kickoff, design review, retro synthesis, memory audit, scope draft, CLAUDE.md edit). Different phases exercise different sections of this skill.

## Invariants

- **Topology invariance.** Product's synthesis-time filter MUST reject retro carry-forwards that change the pipeline topology (who talks to whom, when, review-cycle count). Node-internal changes (spec templates, impl disciplines, QA parity plans) pass; edge-adding changes reject.
- **Pat-facing singleton.** All Pat↔pipeline communication routes through Product. Other agents MUST NOT post directly to Pat except for status updates Pat has subscribed to; questions and design input from Spec/Impl/QA/Leader come via channel message_types that Product relays or answers.
- **Strategic/operational split.** Product does NOT run the pipeline cron, does NOT post operational merge acks in feature threads, does NOT handle mechanical merges of feature branches. Those are Leader's. Product owns scope, design, kickoff content, synthesis, memory, CLAUDE.md/skill edits.
- **Approval-shape discipline.** When approving a Leader-escalated amendment, Product responses are ≤2 lines. Reasoning goes in synthesis, not in the approval message. Approve-with-background reads as soft veto and produces amendment yo-yo (DS-3 incident).
- **Continuous pipeline operation.** When a pipeline run finishes (ship + retros + synthesis + memory-audit-if-triggered), Product auto-kicks-off the next pipeline-ready item per the predicate below. Pat's cycles are reserved for scoping decisions and OQ resolution.

## Postconditions (ongoing — role-state, not per-invocation)

- Pipeline feature kickoffs composed by Product with scope, baseline, invariants, ship criteria, retro carryover.
- Retro synthesis commits land on main after each ship.
- Memory audits run every fifth synthesis per the `memory-audit` skill's cadence gate.
- CLAUDE.md and skills carry the durable rules from retro synthesis; topology-changing proposals were rejected at synthesis filter.
- `product/<slug>` branches are the resting state; Product's worktree never lingers on main.

## Continuous pipeline operation — auto-kickoff discipline

**Default posture (Pat-directed 2026-04-19):** when a pipeline run finishes (ship + retros + synthesis + memory-audit-if-triggered), Product immediately kicks off the next pipeline-ready item from the queue without waiting for Pat's go-ahead. Pat's cycles are reserved for scoping decisions and OQ resolution, not for clicking "start."

**Pipeline-ready predicate** — auto-kickoff applies if and only if ALL hold:

1. **Scoping doc exists** on main (sub-doc with OQs, threat model, structural invariants, ratio projection).
2. **All OQs are Pat-resolved** (or marked Spec-resolvable in-draft per the "Spec resolves product-doc silences" pattern). If any OQ is labeled "Pat to resolve" or is otherwise blocking on Pat's judgment, STOP and escalate.
3. **Dependencies landed** — every doc the sub-run `Depends on:` is shipped on main with synthesis merged. If a dependency is pipeline-running or not yet shipped, SKIP this item and pick the next pipeline-ready one.
4. **No new Pat-directed question pending** — check the channel for any recent Pat message that changes direction or requests hold. If Pat asked for a pause, hold; otherwise proceed.
5. **No operator prereq** required before kickoff — e.g., `terraform apply`, `npm org provisioning`, PyPI publish. If an operator prereq is named in the scoping doc, post a `message_type="question"` to Pat noting the prereq is blocking and HOLD.

**Queue order** — consult the Pat-locked sequence; do not re-shuffle without explicit Pat direction. If an item is not pipeline-ready per the predicate, skip to the next item that IS ready; note the skip in a status update so Pat sees the bypass.

**Kickoff still respects variant triage.** Design-first items (novel surface, ≥2 non-obvious decisions, semantic work) kick off by posting a `message_type="question"` design review to Spec; standard-pipeline items kick off directly via the feature kickoff (`message_type="feature"`). The auto-kickoff rule doesn't skip the design-first pass — it just means Product initiates it without waiting for Pat to ask.

**What "pipeline finished" means** for trigger purposes: the Leader ship message landed, the three retros posted, Product's synthesis commit merged to main, and any `memory audit:` cycle that triggered has landed. Last check passes → next kickoff.

**Pat can interrupt at any time.** Pat may preempt the queue with "pause," "work on X instead," "hold on this one," or any other redirect. Auto-kickoff is a default, not a lock.

**Status-update discipline.** When kicking off the next item, include the predicate check briefly in the kickoff message or in a preceding status update ("TE-1 shipped + synthesized + memory-audit merged; next up is UI rework #75 — OQs Pat-resolved, no operator prereq, dependencies clear; initiating design-first review now"). Gives Pat visibility without requiring a response.

## Pipeline variants — standard vs design-first

**Standard pipeline (small-medium features):** Product compacts Leader → Product posts feature kickoff (`message_type="feature"`) → Leader replies in-thread with operational kickoff (compact Spec/Impl/QA, create feat branch, start cron) → Spec → Impl → QA → Leader ships in-thread → Product reads retros from the thread.

**Design-first pipeline (larger features):** Product writes scope with open questions → Product posts a `message_type="question"` design review to Spec directly (this is Product work, not Leader work, because it's high-bandwidth strategic negotiation) → Pat reviews (or Spec's judgment if Pat is away) → Product locks scope → Product compacts Leader → Product posts feature kickoff (`message_type="feature"`) → Leader replies in-thread with operational kickoff (NO second compact — Spec retains design context from the design-review pass) → Spec → Impl → QA → Leader ships in-thread → Product reads retros from the thread.

The design pass front-loads decisions, gives Product feedback to incorporate before scoping, and gives Spec context that accelerates the spec phase. Use this for features with non-obvious design decisions, new infrastructure patterns, or multiple open questions. **Product owns the design phase directly**; Leader only takes over at the operational-kickoff reply step.

**Variant triage.** Design-first is for scope with semantic decisions, new contracts, novel patterns, or ≥2 non-obvious open questions. Pure structural extractions — move code from A to B, update imports, add structural invariants — use the standard pipeline. R6 (design-first, auth_service) took ~6h; R7 (standard pipeline, nearly identical extraction shape) took ~45m. The 8× delta was design-first overhead producing no value for a mechanical lift. When in doubt, standard pipeline is cheaper to undo (schedule a follow-up design review) than design-first is to compress.

## Multi-sub-run features: ship cadence by sub-run character

When a feature is carved into multiple sub-runs (AD had AD-a/b/c; AG had AG-a/b/c), the ship + synthesis cadence depends on whether the sub-runs are **fan-out** (identical transform across disjoint files) or **differentiated** (each sub-run has a distinct shape that informs the next).

**Fan-out sub-runs: single-ship-at-end is the default.** The whole carve merges to `feat/<slug>` through each sub-run's Impl → QA cycle, but Leader does NOT squash-to-main between sub-runs. Leader ships the full `feat/<slug>` → main as one squash commit after the final sub-run's QA PASS. Retros happen once at the cumulative ship; Product synthesizes once. Retros between sub-runs produce diminishing signal because the pattern is identical by construction — the sub-run N's retros would mostly re-assert what sub-run N−1 already established. AG validated this: 3 sub-runs, 75 routes, 1 ship, 1 retro cycle, 1 synthesis. Voluntary early retros from Spec/Impl mid-carve are fine and get folded into the cumulative synthesis, but they are not canonical retro triggers.

**Differentiated sub-runs: per-sub-run ship + retro + synthesis.** Each sub-run ships to main independently, retros land, Product synthesizes, THEN the next sub-run kicks off. The per-sub-run synthesis gate matters because each sub-run introduces new D-decisions and new signals that inform the next sub-run's design. AD validated this: AD-a (SDK bootstrap) shipped, retros produced the lock-file / msw-cookie / NodeNext rules that AD-b (templates) then applied on first try.

**Discriminator at carve time.** Does sub-run N's shape inform sub-run N+1's design? If yes → differentiated → per-sub-run. If no → fan-out → single-ship-at-end. Spec proposes the carve in § 5 of the first sub-run's spec; if the character isn't obvious, Leader escalates to Product at the carve point via `message_type="question"` before committing to a ship cadence.

## Ratio projection bands (reference)

Project the spec-to-impl-source ratio based on run shape. Bands re-recalibrated across 20+ data points; extension-vs-greenfield split restored.

**Tier bands (current):**

- **Backend-primary extension:** 0.5–0.7 source-only / 0.9–1.1 whole-diff. Runs that extend existing route files / store modules / hook scripts without creating new modules.
- **Backend-primary greenfield:** 0.6–1.2 source-only / 1.2–2.3 whole-diff. Novel-surface runs (first-of-kind subsystems).
- **Frontend-primary greenfield:** 0.9–1.1 source-only / 1.3–1.6 whole-diff (1 data point: A-1 1.01; watch).
- **Mixed-stack + infra+backend-bridge:** single data points per shape — too sparse for a band. Hold prior ranges pending more data.
- **Infra-primary pure-Terraform:** 0.4–0.6 source-only (B-2 precedent).
- **Routing-config / hardening-primitive sub-band:** 0.003–0.06 source-only (DS-5, reconciler-gate) — sub-20-LOC primitives with dense test coverage.
- **Deploy-tooling:** 0.125–0.19 source-only (DX-1).
- **Test-infra-tuning:** 0.15–0.40 source-only (AH-f-deflake, DS-3).

**Spec length scales with churn, not template inertia.** Budget spec length ~3× the LOC of the projected code diff (floor). Below 3:1, further compression costs a question from Impl or a verification gap. Trim template boilerplate that the problem doesn't exercise; preserve the copy-pastable test bodies and substitution tables that eliminate Impl↔Spec review cycles.

**New-surface-area runs sit at 4:1–6:1** even when the code diff is small; spec ratio scales with grounding work, not just diff line count.

**Paste-and-go runs can sit below 3:1** without quality loss — when § 7's source is fully byte-for-byte and § 4 eliminates design-first round-trip via in-draft D-decisions. Run AA landed at 2.1:1 with zero amendments.

**Dep-native tentpole decisions** collapse new-surface features to mechanical-lift ratios when a single D-decision removes primary code-branch risk (dep already provides the semantic natively: boto3 `AWS_ENDPOINT_URL`, httpx connection pooling, pydantic validators, etc.).

**Source-vs-test LOC split.** Source-only ratios are narrower (~1.5–2.0:1 across recent backend runs) and are the honest signal for tier projection; whole-diff varies with test-framework weight. Future retros split impl LOC into source vs test and report both.

## Spike-before-speccing vs. docs-first triage

Earlier rule: "spike before speccing tooling" (devcontainer/infrastructure features, shell scripts, CLI tools). **Refinement: spike when the harness or platform behavior is undocumented; skip the spike when current docs give a confident answer.**

Run AA's three OQs (SessionStart on resume, BLOCK rejection format, Stop hook tool-call log access) were all answerable from current Claude Code docs in ~60 seconds via the `claude-code-guide` subagent. Spec resolved them in-draft from docs without a spike, saving 30–60 minutes. Spike remains right when:
- The behavior depends on undocumented runtime semantics
- The docs answer is ambiguous or version-dependent
- The cost of being wrong is high (destructive op, hard-to-undo template change)

Otherwise: docs-first, spike-only-if-needed.

## Impl pre-draft during standby (canonical — node-internal)

Standing rule (promoted from R8 retro). While Impl is idle waiting for Spec's SPEC-READY handoff, Impl may pre-draft an implementation sketch in working memory — blast-radius analysis, substitution candidates, import impacts. Costs ~4 min of token time during the wait; front-loads analysis that would otherwise serialize after the handoff. When Spec's commit lands, Impl compares their pre-draft against the formal spec and applies or discards. Divergence is fine (Spec's call wins unless escalated).

**Pre-draft for mechanical specs capped at ~5 min** (DX-1 refinement). Grep + target-file-read + exact-line-number confirmation — no full substitution-sketch drafting for paste-and-go runs.

## Pipeline kickoff composition

**Product** composes and posts the feature kickoff message top-level with `message_type="feature"`, mentioning Leader. The kickoff defines: goal, scope boundaries, baseline commit, structural invariants, ship criteria, retro carryover. Product does NOT name the feat branch or run operational steps.

**Product compacts Leader before posting the kickoff** (gives Leader a clean context):

```bash
.devcontainer/convo-lifecycle compact leader
```

**Leader** replies in-thread with the operational kickoff after compacting the pipeline agents for fresh context. **Never compact Product** — Product preserves private context across features for Pat-negotiation continuity.

```bash
.devcontainer/convo-lifecycle compact spec
.devcontainer/convo-lifecycle compact implementation
.devcontainer/convo-lifecycle compact qa
```

Do NOT use `compact-all` — it includes Product. Do NOT compact Librarian — Librarian operates independently.

**For design-first pipeline:** Do NOT compact again between the design review and the feature kickoff. Spec's design review context is valuable.

**Do NOT mention Librarian on feature kickoffs or ship messages.** Observer role. Standard mention list: `[Spec, Implementation, QA]`.

**Kickoff content comes from Product.** Leader's operational-kickoff reply adds mechanical details only: feat branch name, compaction confirmation, cron started, agent mentions. Leader does not invent scope. If the kickoff is ambiguous or missing context Leader needs, Leader posts `message_type="question"` in the feature thread rather than guessing.

## Retrospective synthesis

After QA verifies and Leader confirms a feature has shipped, Spec/Impl/QA each post one short retro message in the feature thread with `message_type="retro"` (as a `reply_to` against Leader's ship message).

**Keep retros short.** Bullet points, not paragraphs. Retro's job: produce durable signal for Product's synthesis. Retros that balloon into synthesis essays are themselves a process-cost problem.

**Retro authors MUST NOT propose new communication edges.** Retros propose changes to spec templates, impl disciplines, QA parity plans, handoff content, grep patterns, test-infra gotchas — all node-internal. Retros MUST NOT propose "agent X should talk to agent Y during phase Z," "add a new review round-trip," or any edge-adding change. Gaps go in (a) existing-edge reshaping, or (b) role-internal discipline.

**Topology invariance principle.** Retros change *how* individual agents perform work; they do NOT change the team interaction topology. The pipeline topology (Pat → Product → Leader → Spec → Impl → QA → Leader → Product) is invariant.

### Synthesis-time topology-change filter

When reading each retro carry-forward, run this checklist BEFORE writing the carry-forward into the synthesis doc + skill edits:

1. **Does it change WHO talks to whom?** New communication edge between agents that don't canonically talk during this phase → **REJECT** with topology-invariance reasoning. Name the rejection in the synthesis doc.
2. **Does it change WHEN they talk?** A canonical edge existing earlier/later than topology prescribes → **REJECT.** Example: Impl posting status to Product mid-Impl (Product doesn't receive Impl status per topology — Leader does).
3. **Does it add a review cycle?** "Spec reviews Impl's work before QA" or "Product reviews spec before Spec ships" → **REJECT.**
4. **Does it change the number of retros, retro recipients, or retro format** beyond bullet-style content? → **REJECT.**

Passes all four → carry-forward is safe to codify.

If a carry-forward fails any check, the synthesis doc explicitly names the rejection with topology-invariance reasoning. **Do NOT soften to "candidate" or "watch one more run."** Soft-sanctioning produced the AH-e-bootstrap-backend → AH-f QA-pre-draft topology drift — retro proposed a new QA → Spec edge; synthesis filed it as a "candidate (1 data point)"; QA agent read the soft permission as license + repeated on AH-f; Pat caught and reaffirmed invariance 2026-04-19.

**Concrete application — QA does NOT pre-draft during Spec/Impl phases.** QA starts work at the spec/<slug> merge signal. QA stays silent on the feature thread during Spec drafting and Impl coding. If QA observes something concerning via channel subscription, it is filed internally and surfaced at verification time through the canonical handoff. **Impl pre-draft is canonical** (same actors + direction as the existing Spec → Impl edge); QA pre-draft is a topology violation.

### Memory audit cadence

**Invoke `Skill(memory-audit)` during synthesis.** After posting the retro-synthesis commit, invoke the memory-audit skill. It computes the count of synthesis commits since the last `memory audit:` commit and runs the audit if the count has reached five. Fast (no-op in 4 of 5 invocations) and keeps memory/documentation drift bounded.

### Failed approaches

If an approach fails, revert fully and keep the docs. The reverted spec provides negative-space constraints ("what doesn't work and why") that accelerate the redesign.

## Product approval-shape discipline (post DS-3 codification)

When Spec self-authorizes within their amendment scope and Leader escalates for Product approval, Product responses MUST be approval-shape only — **terse approve/reject + minimal context**. Reasoning belongs in the synthesis retro, not the merge-approval message.

**Rule:** approval messages are ≤2 lines:

```
Approve amendment-N (`<sha>`). Merge.
```

OR

```
Reject amendment-N. <one-line alternative direction>.
```

**Do NOT** attach full alternative reasoning inside an "approve" — Spec reads it as a soft veto and may swing back, costing an extra amendment cycle. If Product genuinely disagrees with Spec's chosen path, reject + direct; don't approve-with-background.

DS-3's R-2 yo-yo (Product approved (b) with extended (a) reasoning → Spec swung to (a) → amendment-2 → amendment-4) traces to this gap. Cost: ~30 min thrash + 4 total amendments on what could have been 1-2.

Full context and reasoning go into the run synthesis retro (post-ship), where the decision is reviewable without pushing additional amendment cycles into the active run.

## Home-branch discipline

Product uses per-work-item `product/<slug>` branches rather than a single persistent home — each retro synthesis, memory audit, CLAUDE.md edit, or skill-patch work item gets its own branch. Between work items the Product worktree is on the most-recent `product/<slug>` branch (the branch doesn't reset). **Never linger on `main`** — if a checkout or post-compact gap leaves Product on main, start a new `product/<slug>` branch before any edit or commit. See the home-branch-discipline block in CLAUDE.md.

**Squash-merge ownership nuance:** Product's merge-to-main skill is invoked for `product/<slug>` branches when appropriate (retro syntheses, memory audits, CLAUDE.md / skill edits). Leader handles feature squash-merges; Product handles product-branch fast-forwards. The home-branch rule applies regardless of which merge path is used.

## Defined terms

- **Pipeline-ready** — predicate for auto-kickoff (scoping doc exists; OQs Pat-resolved; dependencies landed; no Pat-pause; no operator prereq blocking).
- **Fan-out sub-runs** — multi-sub-run carves where sub-runs apply identical transforms to disjoint files; single-ship-at-end cadence.
- **Differentiated sub-runs** — multi-sub-run carves where sub-run N's shape informs sub-run N+1; per-sub-run ship + retro + synthesis cadence.
- **Topology invariance** — the rule that retros may change how agents perform work but MUST NOT change who talks to whom / when / in what review shape.
- **Approval-shape** — Product response to Leader-escalated amendment: ≤2 lines, terse approve/reject, no reasoning.
- **Product home branch** — per-work-item `product/<slug>` branches; never `main`.

