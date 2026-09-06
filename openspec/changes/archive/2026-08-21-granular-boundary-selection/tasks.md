## 1. Safe boundary model

- [x] 1.1 Generalize the turn-candidate module into safe retained-boundary candidates for default user exchanges and advanced assistant checkpoints; verify unit tests cover eligibility, labels, and exclusion of tool-result entries.
- [x] 1.2 Build targeted compaction preparation from the generalized candidate, including split-turn prefix messages and file-operation collection; verify unit tests cover an assistant boundary before retained tool results.
- [x] 1.3 Revalidate generalized pending boundaries immediately before compaction without changing ordinary Pi compaction behavior; verify the existing stale-boundary and non-targeted-compaction tests still pass.

## 2. Progressive picker interaction

- [x] 2.1 Replace the fixed user-exchange selector with a toggleable picker that starts in the default view and uses the documented `a` hotkey to reveal or hide agent checkpoints; verify picker-state tests cover both toggle directions and cancellation.
- [x] 2.2 Update selection confirmation and command feedback to describe the selected item as the first message retained verbatim; verify user-exchange and agent-checkpoint confirmation paths preserve session state when declined.
- [x] 2.3 Provide an explicit view-switch control for supported non-terminal dialog modes when a raw terminal hotkey is unavailable; verify the command remains usable through Pi's dialog-capable UI abstraction.

## 3. Documentation and verification

- [x] 3.1 Update the README with default versus advanced picker behavior, the `a` hotkey, safe-boundary constraints, and split-turn retention semantics; verify the documented local install command remains accurate.
- [x] 3.2 Run `pnpm typecheck`, `pnpm test`, and `pnpm pack:dry-run`; verify all commands succeed and the package remains publishable.
