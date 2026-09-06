## 1. Prerequisite and shared boundary integration

- [x] 1.1 Apply or verify the completed `granular-boundary-selection` change before this change, then verify its shared safe-boundary candidates include user exchanges and split-turn assistant checkpoints.
- [x] 1.2 Update targeted-compaction types and metadata to carry generalized boundary provenance and agent-directed state; verify existing user-directed compaction tests remain valid.

## 2. Model-callable compaction controls

- [x] 2.1 Register `list_compaction_boundaries` to return concise IDs, kinds, and previews for current safe candidates only; verify tool tests exclude tool results and report an empty result without session mutation.
- [x] 2.2 Register `schedule_compaction` with a boundary ID and optional summary focus, validating the request immediately and allowing one pending request; verify tool tests cover successful scheduling, invalid IDs, summary focus, and duplicate-request rejection.
- [x] 2.3 Add model-facing tool guidance for deliberate milestone use and the discovery-before-scheduling workflow; verify the registered tool descriptions expose both intended behaviors.

## 3. Deferred execution safety

- [x] 3.1 Implement the session-scoped scheduled-to-triggering lifecycle and invoke compaction only after the matching agent run settles; verify a tool call itself does not abort the agent and a settled run triggers exactly one compaction.
- [x] 3.2 Gate `session_before_compact` customization on the triggering agent-directed request, revalidate the boundary and queued-user-input state, and clear pending state on every terminal path; verify native `/compact`, automatic, and overflow compaction remain unmodified.
- [x] 3.3 Add user notifications and checkpoint details for scheduled, completed, cancelled, and failed agent-directed compaction; verify lifecycle tests assert observable status and recorded provenance.

## 4. Documentation and release checks

- [x] 4.1 Update the README with agent tool names, deferred no-confirmation behavior, safe-boundary limits, and the `granular-boundary-selection` prerequisite; verify examples match the registered tool contract.
- [x] 4.2 Run `pnpm typecheck`, `pnpm test`, and `pnpm pack:dry-run`; verify all commands succeed with the new tools included in the package.
