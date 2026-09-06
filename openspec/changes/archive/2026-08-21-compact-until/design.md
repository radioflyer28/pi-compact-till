## Context

This is a new, publishable TypeScript Pi package; no application code exists yet. The requirements are defined in `specs/targeted-turn-compaction/spec.md` and `specs/pi-package-distribution/spec.md`. Pi exposes custom slash commands, dialog UI, session inspection, an explicit `ctx.compact()` command API, and `session_before_compact` for custom results.

## Goals / Non-Goals

**Goals:**
- Build a targeted, inclusive compaction command without changing Pi's default compaction paths.
- Preserve the selected tail as raw active context so subsequent turns can reuse a stable prefix.
- Keep package installation and local testing straightforward.

**Non-Goals:**
- Alter Pi's automatic cut-point policy, compaction prompt, session-tree navigation, or model/provider configuration.
- Preserve a selected tail indefinitely; a later native compaction may summarize it.
- Compact the final available exchange when no later user-turn boundary exists.

## Decisions

### Register one explicit command and one scoped hook override

The extension will register `/compact-until [summary focus]`. Its handler will wait for agent idle, calculate candidates, use `ctx.ui.select` and `ctx.ui.confirm`, record a one-shot pending boundary in extension memory, and invoke `ctx.compact()`.

`session_before_compact` will return a custom compaction result only while that pending boundary exists and the command-triggered compaction is being processed; otherwise it returns nothing. The pending state is cleared in `finally` and on session shutdown. This keeps native `/compact`, threshold compaction, and overflow retry behavior untouched. Replacing or intercepting `/compact` was rejected because it changes existing user expectations and risks interfering with automatic recovery.

### Select whole safe exchanges and retain from the following user turn

A candidate begins at an uncompacted user message and ends immediately before the next user message. The selected candidate is summarized inclusively, including assistant messages and any tool calls/results. The following user message becomes `firstKeptEntryId`, so the entire newer tail remains raw and ordered.

Candidates are derived only from the active branch after the most recent compaction's retained boundary and exclude the final exchange if it has no following user-turn boundary. This avoids invalid cut points and prevents separating tool results from their calls. Selecting arbitrary message IDs or cutting at tool output was rejected because Pi does not permit unsafe cut points.

### Reuse Pi-compatible summary generation and session format

The hook will construct the selected source span, include any prior compaction summary and tracked file operations, and call Pi's public summary-generation utilities with the active model, optional focus text, and cancellation signal. It will return the resulting summary, usage, selected `firstKeptEntryId`, current token count, and extension details identifying the command and boundary.

The extension will use Pi's session-compaction lifecycle rather than directly editing session files. This preserves Pi's checkpoint semantics, summary accounting, and future session rebuild behavior. A hand-written JSONL compaction was rejected because it would bypass validation and be brittle across Pi session-format changes.

### Use a minimal package surface

The package will expose a single TypeScript extension through the `pi.extensions` manifest. `package.json` will use `pi-compact-till`, include the `pi-package` keyword, declare `@earendil-works/pi-coding-agent` as a peer dependency, and keep runtime dependencies empty unless a Pi API requires one. Type checking and tests remain development-only; Pi's production package installation will not depend on them.

The README will document `pi install npm:pi-compact-till`, `pi -e .`, the command syntax, selection behavior, later-compaction limitation, and supported Pi API baseline.

## Risks / Trade-offs

- [Pi extension API evolution] → Keep integration at documented public command, UI, session, and compaction APIs; use a peer dependency and test against the supported Pi release.
- [Large candidate lists overwhelm a basic selector] → Use concise, truncated turn previews and the standard selectable UI in v1; defer a custom virtualized TUI.
- [Summary generation fails or is cancelled] → Return no compaction result, clear pending state, notify the user, and leave active context unchanged.
- [Concurrent or stale command state] → Wait for idle before selection, bind pending state to the active session and chosen retained-entry ID, and clear it after completion or shutdown.
- [No safe retained boundary] → Exclude the last exchange and report that no eligible turn is available instead of creating an invalid checkpoint.

## Migration Plan

1. Publish the initial package version after local package and Pi smoke tests pass.
2. Users install with `pi install npm:pi-compact-till` or test a checkout with `pi -e .`.
3. Rollback is uninstalling the package with Pi; it writes no persistent settings or session mutations until a user confirms a compaction.
