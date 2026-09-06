## Why

Pi's built-in compaction chooses a token-budget cut point, which can summarize conversation context that a user wants to preserve verbatim. Long local-model sessions need a deliberate way to compact completed work while retaining the current working context for prompt-cache reuse and task continuity.

## What Changes

- Add a publishable Pi package named `pi-compact-till`.
- Add a `/compact-until [summary focus]` command that lets a user interactively select a completed user turn as the inclusive compaction boundary.
- Summarize all still-verbatim context through the selected turn's full exchange, including linked tool activity, while retaining every later entry unchanged in the new compaction checkpoint.
- Preserve native `/compact`, automatic compaction, and overflow recovery behavior when targeted compaction is not active.

## Capabilities

### New Capabilities

- `targeted-turn-compaction`: Let Pi users select a completed user exchange as an inclusive, safe compaction boundary and create a compatible compaction checkpoint.
- `pi-package-distribution`: Distribute the extension as an npm-installable Pi package with documented local and published installation paths.

### Modified Capabilities

- None.

## Impact

- Adds a TypeScript Pi extension, package metadata, documentation, and automated tests to this currently empty package repository.
- Uses Pi's extension command UI, session-compaction hook, and `@earendil-works/pi-coding-agent` peer API.
- Adds no runtime service, telemetry, or non-Pi runtime dependency.
