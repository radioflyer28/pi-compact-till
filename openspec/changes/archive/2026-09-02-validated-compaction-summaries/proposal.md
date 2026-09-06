## Why

Targeted compaction can summarize substantially more history than Pi's normal recent-context cut point, increasing the impact of malformed or incomplete checkpoints. The package should give Pi a consistent coding-handoff rubric and reject structurally unusable summaries before they replace prior context.

## What Changes

- Add a package-defined compaction rubric that prioritizes goals, constraints, decisions, work state, exact technical identifiers, verification results, blockers, and the next action.
- Combine that rubric with optional user `/compact-until` instructions or agent `summaryFocus`, while continuing to use Pi's existing `compact()` implementation.
- Validate each generated targeted-compaction summary against the expected normal or split-turn structure.
- Retry one structurally invalid summary with corrective instructions, preserving the original caller focus and accounting for both attempts' usage.
- Cancel compaction without replacing context when the retry remains invalid.

## Capabilities

### New Capabilities

- `validated-compaction-summaries`: Define shared summary instructions, structural validation, retry, and safe failure behavior for user- and agent-directed targeted compaction.

### Modified Capabilities

<!-- None. Existing boundary selection and scheduling contracts remain unchanged. -->

## Impact

- Affects targeted compaction orchestration in `extensions/compact-until.ts` and adds focused summary-policy/validation logic.
- Extends tests for instruction composition, normal and split-turn validation, successful repair, exhausted retry, caller focus, and usage accounting.
- Continues using Pi's active model, credentials, serializer, compaction prompt, retry plumbing, token budget, checkpoint format, and file-operation metadata.
- Does not affect native `/compact`, automatic compaction, or overflow recovery when no targeted compaction is pending.
