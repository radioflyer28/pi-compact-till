## 1. Package foundation

- [x] 1.1 Create the publishable `pi-compact-till` package manifest, Pi extension manifest, TypeScript configuration, license, and npm package file allowlist; verify `npm pack --dry-run` contains only the intended distributable files.
- [x] 1.2 Add README installation and usage documentation for `pi install npm:pi-compact-till`, `pi -e .`, `/compact-until [summary focus]`, retained-tail behavior, and future-compaction limitations; verify all commands and package names match the manifest.

## 2. Turn-boundary selection

- [x] 2.1 Implement pure active-branch parsing that identifies the latest retained boundary, groups entries into complete user exchanges, produces concise previews, and excludes exchanges without a following user-turn boundary; verify unit tests cover user/assistant/tool sequences, existing compaction, and no-candidate sessions.
- [x] 2.2 Register `/compact-until [summary focus]` with idle waiting, interactive selection, confirmation, cancellation, and user notifications; verify command tests prove no session mutation occurs before confirmation or after cancellation.

## 3. Targeted compaction

- [x] 3.1 Add scoped pending-boundary state and a `session_before_compact` handler that activates only for the command's matching manual compaction, builds the selected inclusive source span, and returns a Pi-compatible compaction result; verify native manual, automatic, and overflow compaction pass through unchanged without pending state.
- [x] 3.2 Generate the custom summary with Pi-compatible utilities, preserving prior summary/file-operation context, optional focus text, cancellation handling, usage, token metadata, and the next user turn as `firstKeptEntryId`; verify a fixture session retains all later entries in order and includes selected tool activity in the summarized span.
- [x] 3.3 Clear pending state on success, failure, cancellation, and session shutdown, and surface failure without changing active context; verify tests cover summary failure, aborted work, stale selections, and extension reload/session switch cleanup.

## 4. Validation and release readiness

- [x] 4.1 Add an automated test suite and type-check command for turn selection, command flow, scoped hook behavior, and compaction-result construction; verify both commands pass from a clean install.
- [x] 4.2 Smoke-test local package discovery with `pi -e .`, confirm `/compact-until` is registered, run `npm pack --dry-run`, and document the tested Pi API baseline before publishing the initial version.
