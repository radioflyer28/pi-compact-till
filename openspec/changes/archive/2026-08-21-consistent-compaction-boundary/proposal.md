## Why

The picker currently labels a user-exchange option with the message that will be compacted, while an agent-checkpoint option labels the message that will be retained. This gives “selected boundary” two incompatible meanings and makes the confirmation text misleading.

## What Changes

- Make every `/compact-until` picker option represent the first message retained verbatim.
- Label, inspect, and confirm user-message and agent-checkpoint boundaries using the same retention semantics.
- Explain that choosing a user-message boundary summarizes the preceding completed exchange.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `targeted-turn-compaction`: Define and present all user-directed boundaries consistently as first-retained messages.

## Impact

- Affects safe-boundary candidate display data, picker and confirmation copy, detail inspection, tests, and README documentation.
- No change to compaction safety, retained-context ordering, or agent tool identifiers.
