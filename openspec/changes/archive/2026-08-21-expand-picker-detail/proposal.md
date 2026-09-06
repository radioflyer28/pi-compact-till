## Why

Boundary labels in the `/compact-until` picker intentionally use short previews, but those previews can leave users unable to distinguish similar or long messages. Users need a quick way to inspect the message behind the current picker row before they decide what context to retain.

## What Changes

- Add a documented picker hotkey that opens a read-only, expanded view of the currently highlighted boundary message.
- Return to the same picker view and highlighted boundary after the detail view is dismissed, without confirming or changing the selected compaction boundary.
- Preserve the existing user-exchange default, agent-activity toggle, cancellation behavior, and non-interactive selection flow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `targeted-turn-compaction`: Let users inspect the full content and identity of the currently highlighted safe boundary from the `/compact-until` picker.

## Impact

- Affects the picker interaction in `extensions/compact-until.ts` and its automated tests.
- Updates user-facing command documentation; no new package dependencies or changes to compaction semantics.
