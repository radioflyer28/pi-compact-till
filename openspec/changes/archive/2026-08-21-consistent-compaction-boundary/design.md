## Context

Safe candidates already store `firstKeptEntryId`, and compaction uses it correctly. For a user boundary, however, the picker label and detail are built from the preceding user prompt while the retained entry is the following user message. Agent-checkpoint rows use the retained entry for both, which makes a common confirmation sentence mean different things. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Make the displayed label, expanded detail, confirmation copy, and retained message refer to the same boundary entry for every candidate kind.
- Preserve the current safe compaction inputs: preceding entries are summarized and `firstKeptEntryId` remains the first verbatim entry.
- Explain the compacted preceding exchange when a user-message boundary is selected.

**Non-Goals:**

- Changing which safe boundaries are eligible or allowing tool-result boundaries.
- Changing the model-facing boundary IDs or agent-directed scheduling behavior.
- Rewriting existing session checkpoints or altering their provenance metadata.

## Decisions

### Use the first retained entry as the display source

For a user-message boundary, derive the label preview and detail from `firstKeptEntryId`, just as agent checkpoints already do. Keep the preceding completed user entry as provenance for compaction construction and checkpoint details, but do not present it as the selected boundary.

Alternative considered: make all choices inclusive “compact through” boundaries. Rejected because an agent checkpoint is valuable precisely when it and its following tool results stay verbatim; making it inclusive would remove that safe mid-turn retention point.

### Make boundary language retention-first everywhere

Use “keep context starting from” and “first retained message” in picker titles, confirmation, and documentation. For user-message boundaries, add a concise explanation that the immediately preceding completed exchange will be summarized. This keeps the convenience of choosing after a completed exchange while making the choice's effect explicit.

Alternative considered: retain current labels and add a longer warning only in confirmation. Rejected because the mismatch remains in the picker and detail view where users form their expectation.

### Preserve compaction mechanics and agent tool contract

Do not change `entriesToSummarize`, split-turn handling, `firstKeptEntryId`, or the agent tool response shape. Update tests to distinguish the displayed retained user message from the prior user entry that still belongs to the summarized exchange.

## Risks / Trade-offs

- [Users expect the old user-exchange preview] → Explain the preceding completed exchange in confirmation and README, and cover labels and detail with regression tests.
- [Display and retained IDs diverge again] → Assert in tests that user-boundary label/detail source matches `firstKeptEntryId`, while compaction inputs still include the preceding exchange.
- [Copy update accidentally changes agent tool behavior] → Retain existing agent-tool tests and add no changes to their schemas or IDs.

## Migration Plan

No data migration is required. New picker copy takes effect for future compactions; existing checkpoints retain their recorded boundary metadata. Rollback is limited to restoring the prior display-source and wording behavior.
