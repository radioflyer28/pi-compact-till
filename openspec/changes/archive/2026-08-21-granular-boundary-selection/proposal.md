## Why

`/compact-until` currently lets users choose only completed user exchanges. That keeps the picker simple, but a single user request can contain a long sequence of agent messages and tool activity, leaving users unable to reclaim context at a useful intermediate checkpoint.

## What Changes

- Keep completed user exchanges as the default `/compact-until` selection view.
- Add an advanced picker mode, reached by a documented hotkey, that reveals eligible agent-message checkpoints alongside user exchanges.
- Define safe checkpoint eligibility so a user can retain context from an assistant message without separating a tool call from its required tool-result activity.
- Make selection and confirmation consistently describe the selected message as the first entry retained verbatim; everything before it is summarized.
- Preserve Pi's ordinary manual and automatic compaction behavior when no `/compact-until` selection is pending.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `targeted-turn-compaction`: Extend targeted compaction selection from completed user exchanges to an opt-in advanced view of all safe user and agent boundaries.

## Impact

- Affects `extensions/compact-until.ts`, boundary-candidate construction, targeted compaction input, and their tests.
- Changes the interactive `/compact-until` command UI while keeping its existing default workflow and package API intact.
