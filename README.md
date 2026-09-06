# pi-compact-till

Choose the first Pi message to retain so newer working context remains verbatim.

## Install

Install the published package globally for Pi:

```bash
pi install npm:pi-compact-till
```

Install it for only the current Pi project:

```bash
pi install npm:pi-compact-till -l
```

To try a local checkout without installing it:

```bash
pi -e .
```

## Use

Run:

```text
/compact-until [summary focus]
```

Every picker choice is the **first message retained verbatim**. The default view lists user-message boundaries that follow completed user exchanges; choosing one summarizes that preceding exchange, including its assistant replies and tool activity, while keeping the selected user message and everything after it.

Press `a` while the picker is open to reveal **agent checkpoints** as well. These are safe assistant-message boundaries inside a long user request. Press `a` again to return to the quieter user-exchange view. In non-terminal Pi dialog modes, choose **Show agent activity** or **Show only user exchanges** instead.

In the terminal picker, press `i` to inspect the full message behind the currently highlighted boundary. This opens a read-only detail panel without selecting a boundary or starting compaction; move to another row or close the picker to dismiss it. The `i` hotkey is terminal-only because non-terminal dialogs do not expose a highlighted row.

Selecting any item means **keep context starting from this message**: earlier active context is summarized, while the selected message and all later context remain verbatim. An agent checkpoint retains an assistant tool call together with its following tool results; tool-result entries are never selectable. Pi summarizes the earlier part of that same user request as split-turn context, so the retained suffix still has the request and progress it needs.

Supplying optional text focuses the generated summary, for example:

```text
/compact-until Preserve current architecture, changed files, and next steps.
```

Native `/compact`, automatic compaction, and overflow recovery remain unchanged. A later native or automatic compaction can summarize the retained tail under Pi's normal rules.

## Agent-directed compaction

The package also gives the Pi agent two tools for deliberate context management. They build on the same safe user and agent boundaries exposed by the `a` picker view.

- `list_compaction_boundaries` returns safe retained-boundary IDs, their kind, and a concise preview.
- `schedule_compaction` accepts one returned `firstKeptEntryId` plus optional `summaryFocus`.

The agent should discover boundaries first, then schedule compaction only after a meaningful transition—such as a completed investigation, passing tests, or archiving an OpenSpec change. Scheduling does not interrupt the current run and does not ask for user confirmation. Once the agent run settles, the package revalidates the selected boundary and compacts only when there is no queued user input.

Pi notifies you when agent-directed compaction is scheduled, completes, is cancelled, or fails. Native `/compact`, automatic threshold compaction, and overflow recovery remain unchanged unless an agent-directed request has reached its triggering phase.

## Development

The package uses the documented Pi extension APIs and is tested against the current `@earendil-works/pi-coding-agent` development dependency.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:dry-run
pi -e .
```
