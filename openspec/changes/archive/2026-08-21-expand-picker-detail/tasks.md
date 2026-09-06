## 1. Boundary detail data

- [x] 1.1 Add a safe-boundary detail formatter that returns the full displayable source message for user exchanges and agent checkpoints, including assistant tool-call names while excluding tool-result targets; verify focused unit tests cover both boundary kinds and empty/non-text content.

## 2. Terminal picker interaction

- [x] 2.1 Add the documented `i` detail hotkey, visible in the terminal picker title, and track the active visible boundary as ordinary navigation occurs; verify focused tests show that `i` consumes only the detail input and does not select or compact.
- [x] 2.2 Render the highlighted boundary's detail in a temporary read-only picker panel, preserve the active picker view and row, and clear the panel on every selection, cancellation, toggle, and error path; verify user-exchange and agent-checkpoint detail flows and cleanup behavior.

## 3. Documentation and regression checks

- [x] 3.1 Document the picker detail hotkey and its terminal-only scope in README; verify it does not conflict with the existing `a` agent-activity toggle.
- [x] 3.2 Run `pnpm typecheck` and `pnpm test`; verify existing targeted-compaction, granular-boundary, and agent-directed behavior remains passing.
