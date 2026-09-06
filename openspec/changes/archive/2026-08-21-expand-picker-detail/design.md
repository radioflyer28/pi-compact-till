## Context

`/compact-until` presently renders each safe boundary as a single, 96-character preview. The terminal picker already receives raw input to switch between the default user-exchange view and the advanced agent-checkpoint view, but it exposes no way to inspect the message represented by a highlighted row. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Add a discoverable `i` hotkey in the terminal picker that reveals expanded detail for the currently highlighted boundary.
- Keep inspection non-destructive: it must not select a boundary, trigger confirmation, or alter compaction inputs.
- Preserve the active picker view and selection while detail is visible, then clean up the temporary detail UI when selection ends.

**Non-Goals:**

- Replacing Pi's selector with a custom picker or changing its normal navigation behavior.
- Making tool results selectable or exposing a separate tool-result inspection flow.
- Changing RPC/non-terminal picker semantics, which have no highlighted-row concept or raw terminal hotkeys.

## Decisions

### Use a transient picker detail panel, not a second dialog

Handle `i` through the existing terminal-input subscription and render the selected message detail in a temporary extension widget while the selector stays open. This keeps the current selector and its highlighted row alive; an abort-and-reopen approach cannot restore selector focus through the current extension UI API. The panel will include the boundary kind, the full available readable text, and assistant tool-call names where relevant. It will be cleared in all picker exit paths.

Alternative considered: abort the selector and open a confirmation dialog containing the detail. Rejected because the UI API does not support restoring a selector's initial highlighted row, making review disruptive and prone to accidental selection changes.

### Make the preview source explicit in boundary data

Extend the safe-boundary representation, or add a closely related formatter, to provide the complete displayable detail for the same source used for each row's preview: the completed user prompt for a user exchange and the retained assistant message for an agent checkpoint. Use the existing text-content filtering and tool-call-name formatting conventions; do not introduce tool results as a new source.

Alternative considered: locate the message by `firstKeptEntryId` only when `i` is pressed. Rejected because a user-exchange row's preview describes its selected completed user prompt, while its first retained entry is the following user message; keeping the preview source explicit prevents showing the wrong message.

### Track picker navigation locally only for detail lookup

Maintain an active candidate index for the visible candidate list while the terminal selector runs. Observe its ordinary up/down navigation keys without consuming them, and consume only the detail hotkey so Pi continues to own selection, confirmation, and cancellation. Clamp or remap the active candidate when the `a` view toggle changes the visible list. The detail display reads that tracked candidate at the instant `i` is pressed.

Alternative considered: derive the highlighted row from Pi's selector after the hotkey. Rejected because the public extension selector API returns only the final selection and exposes no current-highlight accessor.

## Risks / Trade-offs

- [Terminal navigation keys differ from the initially supported keys] → Cover the supported key sequences with focused tests and leave unrecognized input to Pi unchanged.
- [Long message detail crowds the terminal] → Use Pi's widget rendering so it follows the terminal layout and remove it immediately when the picker closes.
- [Candidate rows and their detail source diverge] → Test user-exchange and agent-checkpoint detail formatting from the same safe-boundary candidate data used to render picker rows.

## Migration Plan

No migration or configuration change is required. The hotkey is additive and will be described in the picker title and README. Rollback consists of removing the detail hotkey and temporary widget without affecting saved sessions or compaction checkpoints.
