## 1. Consistent boundary presentation

- [x] 1.1 Change user-message candidate labels, previews, and detail sources to the `firstKeptEntryId` message while retaining preceding-exchange provenance for compaction; verify focused candidate tests distinguish the displayed retained user message from summarized prior context.
- [x] 1.2 Update picker titles, command description, confirmation copy, and non-terminal selector labels so every option describes the first retained message; verify confirmation makes clear that a user boundary summarizes the preceding completed exchange.

## 2. Regression coverage and documentation

- [x] 2.1 Extend picker and targeted-compaction tests to cover user-message and agent-checkpoint boundaries with identical exclusive retention semantics, including tool activity and detail inspection; verify agent tool IDs and results remain unchanged.
- [x] 2.2 Update README command guidance to use retention-first terminology and explain user-message boundaries; verify `a` and `i` hotkey descriptions remain accurate.
- [x] 2.3 Run `pnpm typecheck` and `pnpm test`; verify all targeted-compaction, picker-detail, and agent-directed-compaction tests pass.
