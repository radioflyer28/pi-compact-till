## Why

Pi's automatic threshold compaction chooses a retained tail by token count after the active agent run has ended. The agent understands which recent milestone, decision, or verification evidence is most valuable to keep verbatim, but the current package can use that judgment only by scheduling an immediate compaction rather than influencing Pi's later threshold-triggered compaction.

## What Changes

- Add a soft-threshold compaction advisory that presents the active agent with a small deterministic set of safe retained-boundary options before Pi reaches its automatic threshold.
- Add a model-callable response path that records a one-shot, branch-local preference without starting compaction.
- Include Pi's native handling as an explicit option and token-effectiveness estimates for each targeted option so the agent can choose semantically while the extension enforces structural and capacity safety.
- When Pi later starts threshold compaction, revalidate and apply the selected boundary through the package's targeted, validated compaction flow; fall back to Pi's native compaction on missing, declined, stale, unsafe, ineffective, or failed preferences.
- Keep `/compact-until`, native manual compaction, and overflow recovery behavior unchanged.

## Capabilities

### New Capabilities
- `threshold-compaction-advisory`: Offer safe threshold-compaction boundaries to the active agent, record its preference, and apply it safely when Pi reaches the native threshold.

### Modified Capabilities
- `targeted-turn-compaction`: Permit a valid advisory preference to select the first retained message for automatic threshold compaction while preserving native behavior when no valid preference exists.
- `validated-compaction-summaries`: Apply the continuation rubric and validation to advisory-selected summaries while falling back to native threshold compaction if targeted summary generation or repair fails.

## Impact

- Affects extension tool registration, context-usage monitoring, active-context advisory injection, branch-aware preference persistence, and `session_before_compact` handling for the `threshold` reason.
- Reuses the existing safe-boundary, targeted-input, summary-validation, provenance, and Pi compaction integrations.
- Adds no remote service or runtime dependency; it may add a small advisory and tool result to model context before threshold compaction.
- Introduces compatibility considerations with other extensions that provide `session_before_compact` results, which remain subject to Pi extension load order.
