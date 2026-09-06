## Context

The current command uses Pi's basic string selector and produces candidates only at the next user-message boundary. Its targeted compaction preparation always marks the retained context as a complete turn. Pi's compaction API also supports a safe cut at an assistant message: it retains the assistant message and any following tool results, and summarizes the earlier portion of that user turn separately as a turn prefix.

See [proposal.md](proposal.md) and the targeted-turn-compaction delta spec for the user-facing behavior.

## Goals / Non-Goals

**Goals:**

- Preserve the existing, low-noise user-exchange picker as the default.
- Let a user reveal and select Pi-safe assistant-message boundaries without corrupting tool-call/result context.
- Use Pi's split-turn compaction input so the retained assistant-message suffix has a concise description of the request and earlier work.
- Make the retention direction unambiguous in labels and confirmation text.

**Non-Goals:**

- Add agent-initiated compaction or change `/compact`.
- Expose tool-result entries, custom session entries, or arbitrary transcript offsets as boundaries.
- Persist a picker-mode preference between command invocations.
- Alter Pi's automatic or overflow compaction policy.

## Decisions

### Model candidates as safe retained boundaries

Replace the user-exchange-only candidate model with a boundary model whose identity is the ID of the first entry to retain. It will describe two candidate kinds:

- **User exchange:** the existing behavior. The first retained entry is the next user message, so the entire selected exchange is summarized.
- **Agent checkpoint:** an assistant message within the uncompacted context. The retained suffix begins at that assistant message.

Candidate construction will begin after the active compaction checkpoint, use only message entries, and reject a candidate if it cannot produce both a valid preceding summary and a valid retained message sequence. Tool-result entries are never candidates. When an assistant candidate contains tool calls, it remains the first retained entry, so Pi retains its following tool results with it.

This aligns the extension with Pi's native safe-cut semantics instead of treating every item in the JSONL session log as independently removable. The alternative—letting the user choose any raw entry—would permit invalid assistant/tool-result splits.

### Preserve split-turn inputs for assistant checkpoints

For a user-exchange candidate, keep the existing single summary input. For an agent checkpoint, derive the user message that starts the containing turn and build Pi's complete split-turn preparation:

- summarize earlier complete context as normal history;
- pass the selected turn's prefix, from its user message up to but excluding the retained assistant message, as `turnPrefixMessages`;
- set `isSplitTurn` to true; and
- include file operations from both the history and turn prefix.

Pi then creates both the history summary and its split-turn context summary. Reimplementing that summary prompt in the extension would unnecessarily couple the package to Pi internals.

### Use a toggleable custom picker in the interactive TUI

Replace the plain selector with a focused picker component that owns a stable list of boundary candidates. It starts in the user-exchange view and displays an `a` key hint ("show agent activity"). Pressing `a` toggles the advanced view; the same key returns to the default view. Both views use the same navigation, accept, and escape behavior as Pi selectors.

The advanced view includes user exchanges plus agent checkpoints, and each row labels its kind and preview. Confirmation says "Keep from this message onward" and states that earlier context will be compacted. The command will use the UI facility available in the active Pi mode; where a mode cannot capture terminal keys, it will present an equivalent explicit view-switch action rather than silently exposing every agent message.

Using a custom picker keeps progressive disclosure inside one command and avoids inventing a second public command or an undocumented argument. A global keyboard shortcut would be inappropriate because the toggle only has meaning while this picker is focused.

### Revalidate selection immediately before compaction

Pending selection state will continue to hold only the session ID and first-retained entry ID. Immediately before custom compaction, the extension will reconstruct the candidate from the current context and cancel with a notification if it is no longer safe. This protects against session changes while the dialog or compaction setup is active.

## Risks / Trade-offs

- [The advanced list can be much longer and visually noisier] → Keep it hidden by default, label entries clearly, and show the active view plus toggle hint.
- [An incorrect split-turn preparation could omit context needed by the retained suffix] → Reuse Pi's documented `turnPrefixMessages` and `isSplitTurn` contract; add focused tests for assistant messages before and after tool calls.
- [Pi UI APIs differ by run mode] → Isolate picker presentation from candidate generation and provide an explicit mode-switch control when raw terminal input is unavailable.
- [A session changes after selection] → Revalidate the boundary against the latest context before calling the compactor.

## Migration Plan

1. Add the generalized candidate and split-turn preparation behind the existing `/compact-until` command.
2. Update the README to describe the default view, advanced toggle, and first-retained-boundary semantics.
3. Run typecheck, unit tests, and package dry-run validation.

No persisted session-data migration is required. Rollback consists of releasing or reinstalling the prior package version; existing Pi compaction entries remain valid.
