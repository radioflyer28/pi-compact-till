## 1. Scrollable picker behavior

- [x] 1.1 Implement a terminal-only custom picker component through `ctx.ui.custom` with a five-row scrolling viewport, initialized at the newest eligible boundary; verify a picker fixture with more than five boundaries initially shows the newest rows and can move upward to older rows.
- [x] 1.2 Route `a`, `i`, selection changes, confirmation, and cancellation through the custom picker; verify off-screen detail inspection and view toggling reset to the new view's newest boundary.

## 2. Regression coverage and validation

- [x] 2.1 Extend `/compact-until` tests to navigate to and confirm an older default-view boundary, asserting that its retained-message identifier is used for compaction.
- [x] 2.2 Add coverage for an advanced view with more than five boundaries, asserting that older user-message and agent-checkpoint candidates remain selectable and preserve safe-boundary behavior.
- [x] 2.3 Run `pnpm typecheck` and `pnpm test`; verify all picker, targeted-compaction, and agent-directed-compaction tests pass.
