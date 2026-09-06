## Context

See `proposal.md` for motivation and `specs/validated-compaction-summaries/spec.md` for the behavior contract. Targeted compaction currently builds Pi-compatible preparation data, then calls Pi's exported `compact()` with the active model and optional caller focus. Pi owns serialization, its base summary prompt, provider/auth routing, transient retries, token budgets, split-turn generation, file metadata, and the returned checkpoint shape.

Pi 0.84.2 appends `customInstructions` only to the normal history-summary prompt. Its separate split-turn prefix call uses a fixed prompt. The package can strengthen the history instructions and validate the combined result without replacing Pi's summarizer.

## Goals / Non-Goals

**Goals:**

- Give every targeted history summary a stable coding-continuation rubric while preserving caller focus.
- Detect structurally unusable normal and split-turn summaries before they are persisted.
- Repair one invalid model response without changing the selected boundary or source messages.
- Preserve accurate usage accounting when a corrective attempt succeeds.

**Non-Goals:**

- Replace Pi's compaction model call, message serializer, base prompt, retry implementation, token budget, or checkpoint format.
- Customize Pi's fixed split-turn prefix prompt in this change.
- Prove semantic completeness or factual correctness solely from summary text.
- Alter native Pi compaction when no targeted request is pending.

## Decisions

### Compose one package rubric with optional caller focus

Create a pure instruction composer that always emits the package coding-handoff rubric. When `/compact-until` arguments or agent `summaryFocus` exist, append them in a clearly delimited supplemental section stating that caller focus cannot override the required handoff contract. A corrective attempt appends a separate repair section listing validator failures.

Pass the composed string through Pi's existing `customInstructions` parameter. This preserves Pi's normal prompt and lifecycle while avoiding a second summarization implementation. Replacing Pi's base prompt is rejected because it would duplicate provider, retry, serialization, and compatibility behavior.

### Validate the shape appropriate to the prepared input

Implement a pure validator that receives the summary and preparation facts (`messagesToSummarize.length` and `isSplitTurn`). For a history portion, require Pi's continuation headings in order, exactly once, with non-placeholder content; an explicit none value remains meaningful for empty blockers or constraints. For a split turn, also require Pi's split marker and the `Original Request`, `Early Progress`, and `Context for Suffix` headings in order. When the preparation contains no history messages, accept Pi's `No prior history.` prefix instead of the normal history headings.

Return stable issue codes plus human-readable repair descriptions so tests do not depend on prose. Semantic scoring, keyword matching against arbitrary caller focus, and LLM-as-judge validation are rejected: they are unreliable, add latency, and would turn validation into another open-ended generation problem.

### Retry only a returned but invalid summary

Extract the existing Pi call into a small validated-compaction runner. Call `compact()` once with the composed instructions. If it returns a structurally invalid summary, call it exactly once more with the same preparation and original focus plus corrective instructions derived from the validation result. Do not feed the invalid summary back into the prompt.

Pi already owns retries for transient provider failures. If `compact()` throws, preserve the existing catch-and-cancel behavior rather than multiplying infrastructure retries. If the corrective summary is invalid, throw or return a typed validation failure to the existing hook, which cancels the compaction and emits a precise notification.

### Aggregate successful retry usage and preserve metadata

When the second attempt succeeds, combine both attempts' numeric usage and cost fields into the returned usage while taking the corrected attempt's summary, boundary, and details. Preserve package provenance by merging `compactUntil` metadata exactly as today after validated generation succeeds.

The first attempt is never persisted. If both attempts are invalid, no checkpoint exists on which to record usage; the notification will state that two generations were rejected. Adding a separate usage ledger is outside this package's current session contract.

## Risks / Trade-offs

- [A structurally valid summary can still omit an important fact] → Use a stronger default rubric and keep caller focus; do not claim semantic proof.
- [Strict parsing rejects harmless formatting variation] → Validate only durable headings, order, content, placeholders, and split marker; return focused repair issues and allow one correction.
- [A retry increases latency and cost] → Retry only after a returned invalid summary, cap it at one, and aggregate successful usage.
- [Package instructions do not affect Pi's split-turn prefix prompt] → Validate the prefix structure and document bespoke prefix generation as out of scope.
- [Caller focus conflicts with the handoff rubric] → Delimit it as supplemental and explicitly preserve package requirements.

## Migration Plan

1. Add pure instruction-composition, validation, and usage-combination helpers with fixture tests.
2. Route only pending targeted compactions through the validated runner.
3. Run the existing user-directed, agent-directed, boundary, split-turn, and native-compaction regression suites.
4. Roll back by restoring the direct `compact()` call; no stored data migration is required because successful checkpoints keep Pi's existing format.
