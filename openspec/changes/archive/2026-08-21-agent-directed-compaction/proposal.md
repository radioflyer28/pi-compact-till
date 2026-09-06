## Why

Agents can recognize useful context transitions—such as completing an investigation, passing tests, or archiving an OpenSpec change—before a human user sends another prompt. Allowing the agent to request a safe, deferred compaction lets it manage long-running work without interrupting itself or requiring a user to manually select a boundary.

## What Changes

- Expose model-callable tools for listing safe retained-boundary candidates and scheduling an agent-directed targeted compaction.
- Let the agent select a Pi-safe user or assistant-message boundary and optionally provide summary focus.
- Defer the requested compaction until the current agent run has settled, rather than aborting it from inside the tool call.
- Revalidate the requested boundary at execution time, avoid collisions with normal Pi compaction, and report success, cancellation, or failure visibly.
- Update the targeted-compaction boundary contract so an explicit agent tool request, in addition to `/compact-until`, may set a custom compaction boundary.

## Capabilities

### New Capabilities

- `agent-directed-compaction`: Model-callable discovery and scheduling of safe, deferred targeted compaction checkpoints.

### Modified Capabilities

- `targeted-turn-compaction`: Permit an explicitly requested agent-directed boundary while preserving ordinary Pi compaction when no user or agent request is pending.

## Impact

- Depends on the safe-boundary model proposed in `granular-boundary-selection`; this change is intended to be applied after that change.
- Affects extension tool registration, pending-compaction lifecycle handling, targeted-compaction metadata, tests, and README guidance.
- Does not add a remote service, telemetry, or a new runtime dependency.
