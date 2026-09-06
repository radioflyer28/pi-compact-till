## Context

See `proposal.md` for motivation. `getSafeBoundaryCandidates` already produces the complete ordered set of safe retained-boundary candidates. `selectBoundary` projects that set into the default or advanced view and currently delegates rendering to Pi's `ctx.ui.select` dialog.

Pi's extension selector renders every row at once and is clipped by the available terminal height; it does not maintain a scrolling viewport. The extension must supply a focused custom TUI component for terminal mode while retaining `ctx.ui.select` for non-terminal modes.

## Goals / Non-Goals

**Goals:**

- Open the picker with the five newest eligible boundaries in the active view visible.
- Allow navigation from that initial window to every older eligible boundary, while maintaining the selected candidate's identity for detail inspection and compaction.
- Preserve the existing safe-boundary, view-toggle, cancellation, confirmation, and compaction paths.

**Non-Goals:**

- Change which context entries qualify as safe boundaries.
- Change the exclusive first-retained-message compaction semantics.
- Add search, filtering, or a separate history browser.

## Decisions

### Use a self-contained five-row scrolling terminal picker

Render terminal selection through `ctx.ui.custom` with a small local component that implements Pi's public component shape. The component will render a maximum of five rows, maintain a scrolling viewport, accept normal picker navigation, and return the selected `BoundaryCandidate` through the custom-dialog completion callback. It uses the theme passed by Pi's public UI API and adds no direct dependency on Pi's internal TUI package.

Keep candidates in chronological order and initialize the list at its newest item. Pi TUI will therefore show the five newest rows initially; pressing Up moves into older history and scrolls the viewport as needed. The component will retain an explicit value-to-candidate map rather than resolving a choice from a label.

The alternative of slicing to five candidates and adding a separate "older" dialog is rejected: it introduces a second navigation model and can lose the currently highlighted candidate when views change.

### Integrate existing hotkeys within the custom component

The custom component will intercept `a` to switch views and `i` to show the currently selected candidate's existing detail. It will handle standard navigation, confirmation, and cancellation itself, clear stale detail when selection changes, and forward its selected candidate to the outer picker loop. The outer loop will rebuild the component for a view switch, resetting that view to its newest item.

### Reset presentation state safely when switching views

When the user toggles between the default and advanced views, rebuild the complete chronological projection for the new view and reset its selected item and visible window to that view's newest choices. Detail widgets must be cleared during a toggle, cancellation, or selection so stale content is never shown for a different boundary.

Preserving a numeric cursor position across view changes is rejected because the two filtered lists need not have matching candidates or lengths.

## Risks / Trade-offs

- [Custom input routing can drift from Pi's default keybindings] → Support Pi's documented arrows and Enter/Escape controls alongside the existing `j`/`k` convenience keys, and add an integration-style navigation test.
- [Duplicate labels could select the wrong candidate] → Keep an explicit option-to-candidate mapping or use stable identifiers; do not rely on matching only visible text.
- [Detail inspection can drift from the highlighted row] → Test navigation beyond five rows before invoking `i`, and clear detail state on all picker exits and view changes.

## Migration Plan

1. Replace only the terminal picker with the self-contained custom scrolling component.
2. Run typechecking and picker/targeted-compaction tests.
3. Roll back by reverting the picker-only change; no migration or data cleanup is required.
