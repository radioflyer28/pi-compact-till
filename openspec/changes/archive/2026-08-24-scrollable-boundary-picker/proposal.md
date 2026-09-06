## Why

The `/compact-until` picker currently exposes only the five most recent safe boundaries, preventing users from selecting older context even when a safe boundary exists. Long-running sessions need access to the full eligible history so users can choose the most useful compaction point.

## What Changes

- Keep the five most recent eligible boundaries visible when the interactive `/compact-until` picker opens, while allowing users to scroll upward to every older eligible boundary rather than limiting selection to those initial rows.
- Preserve the existing safe-boundary filtering, default user-message view, advanced agent-checkpoint view, detail inspection, and confirmation behavior while navigating older choices.
- Render the terminal picker with a custom scrollable component through Pi's public UI API because the extension selector clips long option lists instead of scrolling them.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `targeted-turn-compaction`: Allow users to navigate and select any eligible safe boundary in the `/compact-until` picker.

## Impact

- Affects the `/compact-until` picker construction and its picker UI integration in `extensions/compact-until.ts`.
- Requires regression coverage for picker navigation beyond five boundaries, including switching views and preserving selection safety.
- Does not change compaction boundary semantics, candidate eligibility, or the public command syntax.
