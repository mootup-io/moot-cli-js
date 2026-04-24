---
name: handoff
description: Post a structured handoff message to the next agent in the pipeline. Use after completing your work on a feature, before requesting a merge.
argument-hint: [summary of what was done]
---

# Handoff

## Purpose

Transfer control of in-flight pipeline work from one agent to the next. The failure class this skill prevents is the **silent handoff** — agent A finishes work, updates status, and goes idle without notifying agent B, stalling the ring. Also prevents **misdirected handoff** (mentioning the wrong next agent for the current pipeline stage) and **unstructured handoff** (free-form text that omits the branch, the files changed, or the next-agent action items).

**Why it exists as a named skill:** the pipeline order is fixed but the specific next-agent depends on *which stage you just completed*; each handoff format varies by stage (Spec → Impl, Impl → QA, QA → Leader, Leader → Product); and there are exceptions (Spec doc-only, QA verification-only) that the current agent must recognize. Capturing this once keeps handoff structure consistent across the pipeline.

## Preconditions

- **Role:** caller is a pipeline agent (Spec / Implementation / QA / Leader / Product). Librarian is an observer role and does NOT hand off in the feature thread — if Librarian reaches this skill, it's a misfire.
- **Branch committed:** all work is committed to the caller's branch (`<role>/<slug>`). Handing off uncommitted work is a protocol violation; Leader cannot merge what isn't on a branch.
- **Feature thread known:** caller knows the current feature thread's `thread_id` (or an `event_id` within the thread that can be `reply_to`'d). Handoffs posted top-level fork the thread spine.
- **Next-agent identified:** caller has determined the correct next agent based on the pipeline stage just completed. `whoami` + pipeline-order table in this skill, if unsure.

## Invariants

- **Thread discipline.** Handoff messages MUST be replies in the feature thread, not top-level posts. The feature thread is the spine; top-level posts fragment it.
- **Mention-the-next-agent-only.** Per CLAUDE.md mention discipline, `mentions=` includes the next agent and NO ONE else. No broadcast mentions.
- **Display names in text, IDs in `mentions`.** Message text uses "Implementation: pull the branch..."; the `mentions` parameter carries the `agt_*` ID. Mixing raw IDs into text is a readability violation.
- **No acknowledgment after handing off.** Per CLAUDE.md, the caller MUST NOT wait for the next agent to ack. Post handoff, update status, stop.
- **Librarian is never in handoff mentions.** Observer role. Even if Librarian contributed content, handoff mentions are pipeline-only.

## Postconditions

- A handoff reply exists in the feature thread, with `mentions=[<next-agent-id>]`.
- For pipeline stages requiring a branch merge (Spec, Impl, QA with commits), a `message_type="git_request"` reply addressed to Leader has been posted in the feature thread.
- Caller's `update_status` reflects the idle/awaiting state post-handoff.
- Caller is idle — not polling, not re-checking, not acknowledging anything in reply.

## Pipeline Order (reference, not a contract)

```
Pat → Product → Leader → Spec → Implementation → QA → Leader → Product
```

- **Product** composes the feature kickoff (`message_type="feature"`) mentioning **Leader**; Leader replies in-thread with the operational kickoff mentioning Spec/Impl/QA.
- **Spec** hands off to **Implementation** via SPEC-READY reply in the feature thread (and a `message_type="git_request"` to Leader to merge `spec/<slug>` → `feat/<slug>`).
- **Implementation** hands off to **QA** via a `message_type="git_request"` reply to Leader to merge `impl/<slug>` → `feat/<slug>`. QA picks up after Leader's merge ack.
- **QA** hands off to **Leader** via a verification report that MUST mention Leader via the `mentions` parameter. Leader squash-merges `feat/<slug>` → `main` and posts the ship message.
- **Leader** hands off to **Product** by posting the retros-in ping after all three retros land, mentioning Product. Product reads retros, synthesizes, requests merge of `product/run-<label>-synthesis`.

## Procedure

1. **Determine the next agent** from the pipeline order above (use `whoami` if unsure of current role).
2. **Commit all work to the role branch** (`spec/<slug>`, `impl/<slug>`, `qa/<slug>`).
3. **Capture branch state:**
   ```bash
   git branch --show-current
   git diff --name-only feat/<slug>...HEAD
   ```
4. **Post a `message_type="git_request"` reply in the feature thread asking Leader to merge.** Exceptions (no git-request needed):
   - Spec doc-only changes MAY be committed directly to `feat/<slug>` per CLAUDE.md.
   - QA MAY commit small unambiguous repairs directly to `feat/<slug>`.
   - QA verification reports with no repairs need no git-request at all — the verification report itself is the handoff.
5. **Post the handoff message as a reply in the feature thread.** Use `mentions=[<next-agent-id>]`; use display names in the text. For QA, the next agent is **Leader** (ship), not Product.
6. **Update status and stop.** `update_status` ("idle, awaiting next feature" or equivalent). Do not poll, do not ack.

## Practice

**Message format** (default; adjust for stage):

```
Handing off to @NextAgent.

**What was done:** [summary]

**Branch:** `<role>/<slug>` → merge into `feat/<slug>`

**Files changed:**
- `path/to/file1` — [brief description]
- `path/to/file2` — [brief description]

**What you need to do:**
1. [action item]
2. [action item]

**Pointers:** [links to specs, docs, or specific line numbers]
```

**QA verification-complete handoff** uses the gate-results table format from prior QA reports rather than the generic template — a concise gate table communicates pass/fail more clearly than free-form summary.

## Defined terms

- **Feature thread** — the thread rooted at Product's feature kickoff message. All pipeline handoffs for this feature run live as replies within it.
- **Role branch** — per-feature branch owned by the current role: `spec/<slug>`, `impl/<slug>`, `qa/<slug>`, etc.
- **Feature branch** — `feat/<slug>`, the integration branch Leader creates at kickoff and merges role branches into.

