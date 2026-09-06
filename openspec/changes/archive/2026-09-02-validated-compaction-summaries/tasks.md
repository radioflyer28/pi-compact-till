## 1. Summary policy and validation

- [x] 1.1 Add a pure instruction composer for the package continuation rubric, optional caller focus, and corrective validation issues; verify unit tests cover omitted focus, preserved user/agent focus, delimiter text, and repair instructions.
- [x] 1.2 Add a pure structural validator for normal history, split-turn, and no-prior-history summaries; verify unit tests cover required heading order and content, split markers and sections, empty output, duplicate or missing headings, and unfilled placeholders.
- [x] 1.3 Add usage aggregation for a successful corrective attempt; verify unit tests cover every supported token and cost field without mutating either attempt's result.

## 2. Validated targeted compaction runner

- [x] 2.1 Wrap Pi's existing `compact()` call so an initially valid summary returns without another generation while preserving preparation, model, auth, signal, thinking level, boundary, details, and caller focus; verify with a mocked single-call test.
- [x] 2.2 Retry an invalid returned summary exactly once with the same compaction input plus focused repair instructions; verify a valid correction replaces the rejected output, retains original focus, and reports combined usage.
- [x] 2.3 Reject two invalid generations with a typed validation failure and preserve thrown-compactor behavior without a package-level retry; verify tests cover both terminal paths and their call counts.

## 3. Lifecycle integration and regression coverage

- [x] 3.1 Route only pending user- and agent-directed targeted compactions through the validated runner and emit a precise notification when validation is exhausted; verify failed validation cancels the checkpoint and successful validation preserves `compactUntil` provenance.
- [x] 3.2 Extend integration tests for user focus, agent `summaryFocus`, normal boundaries, agent-message split boundaries, and native compaction pass-through; verify existing boundary selection and deferred-execution safety remain unchanged.
- [x] 3.3 Run `pnpm typecheck`, `pnpm test`, and `pnpm pack:dry-run`; verify the full package suite passes and no new runtime dependency is introduced.
