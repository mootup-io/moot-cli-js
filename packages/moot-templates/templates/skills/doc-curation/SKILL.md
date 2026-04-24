---
name: doc-curation
description: Curate repository documentation for agent use. Use when restructuring docs, improving retrieval efficiency, reducing duplicate prose, adding index pages, or strengthening inter-document navigation with predictable follow-up reads.
---

# Doc Curation

## Purpose

Keep repository documentation optimized for fast agent retrieval and reliable human orientation. The failure class this skill addresses is **retrieval drift** — documentation accumulates organically, the same concept gets re-explained across many docs, canonical entry points fade, and agents burn tokens stitching together answers from fragmented sources. Left unaudited, doc trees decay into navigation mazes that cost more to read than they save.

**Why it exists as a named skill:** curation is a judgment-heavy activity (when to split, when to merge, what's "canonical") that benefits from a shared stance rather than each author making ad-hoc calls. The skill captures the stance, the decision heuristics, and the common friction smells so curators at different times make consistent calls.

## Preconditions

- **Role:** any role that edits docs. Most commonly Librarian (who owns `docs/design/`, `docs/arch/`, READMEs) or Product (who owns `docs/product/`).
- **Trigger:** restructuring docs, adding index pages, reducing repeated explanations, splitting or merging documents, or responding to a specific drift flag. Also fires preemptively during post-ship as-built passes when the curator notices duplication or weak entry points.
- **Entry-point awareness:** the curator knows which existing docs currently serve as canonical entry points (`VISION.md`, `docs/architecture.md`, `docs/product/README.md`, `docs/specs/README.md`, etc.) so they can preserve or improve them rather than accidentally orphan.

## Invariants

- **Canonical entry points MUST be preserved.** Overview docs, spec indexes, and runbooks are load-bearing; curation improves or augments them, never demotes or replaces silently.
- **One coherent subject per document.** A doc that answers two unrelated questions is a bad split target — re-partition rather than leaving it mixed.
- **Don't orphan references.** When moving content out of doc A into doc B, update doc A to point at B (or remove A entirely with an index update). Dangling references are process-debt.
- **No duplicate canonical content.** If two docs define the same concept, one MUST be canonical and the other MUST reference it. Both-canonical is the drift state this skill fights.

## Postconditions

- An agent asking a common question about the curated area can answer it from ≤2 reads.
- Canonical entry points are intact or improved.
- Duplicate prose is removed or reduced; cross-references point to canonical sources.
- Where a second read is likely, the "read this next" pointer is explicit in the first doc.
- Any doc moves or renames update the directory index (typically `README.md` in that directory).

## Default stance

- Keep canonical linear entry points: overview docs, spec indexes, runbooks.
- Prefer one coherent subject per document.
- Use headings as retrieval boundaries.
- Use inter-document references to guide the next read when one document is not enough.
- Optimize for fewer read round-trips and lower reconstruction effort.

## Procedure

1. **Identify current entry points** — main overview, setup, spec index, runbook docs. Preserve or improve those before introducing new structure.

2. **Map document types:**
   - Overview: "what is this system?"
   - Subject docs: "how does this area work?"
   - Specs/runbooks: "what should we build?" / "how do we operate it?"
   - Reference: canonical facts, API shapes, protocol copies

3. **Check for agent-friction smells:**
   - Same concept re-explained in many docs.
   - A doc so broad that agents must scan the whole file to answer a narrow question.
   - A concept fragmented across too many docs, forcing multiple reads to reconstruct one answer.
   - No clear "read this first" path.
   - References exist but don't tell the reader what to open next or why.

4. **Choose the retrieval unit.** Default: a subject-oriented doc with a short summary and scoped headings. Split only when sections are weakly related or maintained by different workflows. Prefer one document that answers a common question in one read over multiple that must be stitched.

5. **Edit for retrieval:**
   - Put a 1-3 sentence summary near the top.
   - Use descriptive headings that match likely queries.
   - Move repeated background into one canonical subject doc and reference it.
   - Add explicit inter-document references ("For auth boundaries, read `docs/specs/auth-hardening.md`") when a second read is likely.
   - Keep "See also" / "Related subjects" sections short and action-oriented.

6. **Verify the result:**
   - Can an agent answer the common question from one read?
   - If a second read is needed, is the next doc obvious?
   - Did token cost go down by reducing duplicate prose or pointless hops?

## Practice

**Good primary-doc size** is usually a few hundred to low-thousand tokens. Substantially smaller → probably too granular (merge candidate). Substantially larger → probably too broad (split candidate).

**Good split:** "auth model" and "invite flow" are different subjects with different maintenance cadences.

**Bad split:** one coherent subject scattered across several weakly differentiated docs. Symptom: every answer requires reading 3+ files.

**One strong README/MOC per doc area > many weak index notes.** Prefer a single well-maintained entry point. Multiple competing indexes are drift.

**For cross-cutting topics, one canonical subject doc + references from specs and overviews.** The canonical doc is the single source of truth; other docs reference it rather than re-defining.

## Output expectations

When proposing or making changes, explain in the commit / PR body:
- Which entry points were preserved or added
- Which docs became canonical for repeated concepts
- Which duplicates were removed or reduced
- Which inter-document references were added or clarified
- Whether the change reduces round-trips for agents

## Defined terms

- **Canonical entry point** — a load-bearing doc (overview, index, runbook) that agents and humans find first. Curation preserves these.
- **Retrieval unit** — the granularity at which a doc is expected to be read. Good retrieval units answer a common question in one read.
- **Agent-friction smell** — a doc-structure pattern that forces unnecessary reads, duplication, or reconstruction effort.

