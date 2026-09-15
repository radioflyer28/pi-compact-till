## Context

See `proposal.md` for motivation and the delta specs for behavioral requirements.

Pi checks automatic threshold compaction after an agent run and before `agent_settled`. At that point there is no ordinary active model turn in which the agent can call a boundary-selection tool. The public `session_before_compact` seam supplies Pi's resolved preparation and permits an extension to return a completed replacement compaction, but it does not accept an alternate preparation or expose resolved compaction settings before the threshold event.

The package already has three relevant implementation modules: `turns.ts` derives structurally safe first-retained boundaries, `targeted-compaction.ts` builds Pi-compatible input for a selected boundary, and `summary-policy.ts` generates and validates coding-continuation checkpoints. The current extension combines the human picker, agent scheduling tools, pending state, and lifecycle hooks in `compact-until.ts`.

## Goals / Non-Goals

**Goals:**

- Ask the active agent for semantic boundary preference early enough to avoid an extra model call during compaction.
- Keep Pi's threshold decision authoritative and make every advisory failure monotonic toward native behavior.
- Represent advisory and response state in the session so branching and reloads have predictable semantics.
- Reuse one targeted-compaction execution path for user, scheduled-agent, and advisory-selected checkpoints while preserving their different failure policies.
- Keep the agent-facing choice small, structurally safe, and informed by conservative retention estimates.

**Non-Goals:**

- Do not alter native overflow recovery or native manual `/compact`.
- Do not let an advisory start compaction or replace the existing explicit `schedule_compaction` behavior.
- Do not retain arbitrary isolated messages; a choice still selects one contiguous verbatim suffix.
- Do not ask a second model to choose a boundary inside `session_before_compact`.
- Do not guarantee that an advisory appears before every threshold event; abrupt context growth and custom Pi settings may cause native compaction first.

## Decisions

### Issue a best-effort advisory from the normal agent context

Register a `context` handler that checks `ctx.getContextUsage()` before each model call. When usage first meets the advisory threshold for the current compaction epoch, build an offer and append one hidden custom session entry containing its bounded metadata. Inject a non-persistent custom message into that provider call describing the offer and naming the response tool.

The default advisory threshold will be 70 percent of the active model context window. Register `--compact-until-advisory-threshold <percent>` as a string-valued extension flag, parse values in the exclusive range 0 to 100, and fall back to 70 with a warning when invalid. This is deliberately independent of Pi's resolved automatic threshold because that setting is not available through `ExtensionContext`; if Pi compacts before the offer, native behavior wins.

The injected message is presented only on the call where the offer is created. If the agent does not respond in that call, the offer remains valid but is not repeatedly injected. Persisting the hidden offer marker enforces at-most-once behavior across reload and makes branch ancestry the source of truth.

A reactive model call from `session_before_compact` was rejected because it would add latency, cost, prompt-injection exposure, and another network failure at the point of greatest context pressure. Triggering a follow-up agent turn from the threshold hook was rejected because it would delay native compaction and could produce a threshold loop.

### Model advisory state as a branch-local compaction epoch

Define a compaction epoch by the active session ID plus the latest active compaction entry ID, or an `initial` sentinel before the first compaction. Persist an offer as a custom entry that does not enter model context:

```ts
interface CompactionOfferEntry {
  schemaVersion: 1;
  offerId: string;
  sessionId: string;
  epochId: string;
  thresholdPercent: number;
  options: OfferedBoundary[];
}
```

Persist an accepted or native response in the advisory tool result details:

```ts
interface CompactionAdvisoryDecision {
  schemaVersion: 1;
  offerId: string;
  sessionId: string;
  epochId: string;
  decision: "targeted" | "native";
  firstKeptEntryId?: string;
  kind?: "user-exchange" | "agent-checkpoint";
  summaryFocus?: string;
}
```

On startup and before threshold handling, reconstruct the latest offer and decision from the active branch rather than trusting only in-memory state. A branch that excludes either entry naturally excludes the preference. A newer compaction ID starts a new epoch and makes prior records inert. A later valid response for the same offer supersedes an earlier response.

Storing only in memory was rejected because reloads would duplicate offers and lose accepted choices. Sending the offer as a persistent model-context message was rejected because unanswered offers would remain in future prompts until compaction. The custom offer entry plus one-call injection preserves lifecycle state without permanently adding the advisory text to model context.

### Build options deterministically from the safe-boundary kernel

Use `getSafeBoundaryCandidates()` as the structural source. For each candidate, derive the retained suffix from its `firstKeptEntryId`, convert retained entries with `sessionEntryToContextMessages()`, and sum Pi's exported `estimateTokens()` estimates. Report:

```ts
interface OfferedBoundary {
  optionId: string;
  firstKeptEntryId: string;
  kind: "user-exchange" | "agent-checkpoint";
  preview: string;
  retainedTokens: number;
  reclaimedTokens: number;
  projectedTokensAfter: number;
  splitTurn: boolean;
}
```

At offer time, estimate `projectedTokensAfter` as retained tokens plus a conservative summary allowance. Admit only candidates that leave a response reserve of at least the larger of 16,384 tokens and the active model's configured maximum output, plus the summary allowance. These estimates inform and filter the menu; they do not replace trigger-time validation.

Offer at most four targeted options plus a separate `native` option whose exact cutoff is explicitly described as being computed by Pi at trigger time. Select targeted options as follows:

1. Prefer safe user-exchange candidates.
2. Sort them by retained-token count and choose a spread across the eligible retention range, including the largest safe retained suffix and the largest useful reclamation, rather than adjacent near-duplicates.
3. Fill remaining user slots by repeatedly choosing the candidate farthest in retained-token distance from those already selected.
4. Add at most one agent checkpoint when it is in the current long turn or changes retained context by at least 4,096 tokens relative to the nearest selected user boundary.
5. Use opaque per-offer option IDs in the injected advisory; resolve them only through the persisted offer.

A semantic classifier was rejected: the active agent already has the relevant semantic context, while the extension needs only to guarantee structural safety, useful diversity, and capacity effectiveness. Presenting every candidate was rejected because a large menu consumes context and degrades choice quality.

### Record a preference through one advisory-specific tool

Register `choose_compaction_boundary` with this interface:

```ts
{
  offerId: string;
  optionId: string; // an offered opaque ID or "native"
  summaryFocus?: string;
}
```

The tool verifies that the offer is the latest active offer in the current session and epoch, verifies exact option membership, and re-resolves targeted boundaries against `buildContextEntries()`. It records the decision in tool result details and never calls `ctx.compact()`.

Keep `list_compaction_boundaries` and `schedule_compaction` for explicit immediate-after-run compaction. The advisory tool has a separate name and ordering contract because it records a preference for Pi's future threshold rather than scheduling work. A combined tool with timing modes was rejected because it would make the existing scheduling interface and failure messages more complex for both agents and users.

### Revalidate effectiveness at the native threshold

Extend `session_before_compact` dispatch without changing the existing explicit path:

```text
manual + triggering explicit request -> existing targeted behavior
threshold + valid targeted advisory  -> advisory targeted behavior
all other cases                      -> return undefined
```

For threshold handling, reconstruct the latest active decision and require `decision === "targeted"`. Re-resolve its boundary, rebuild targeted input from the current entries, and estimate the current retained suffix. Compare the projected post-compaction context against the active model window and `event.preparation.settings.reserveTokens`, with an additional safety margin of the larger of 4,096 tokens and five percent of the model window. If the candidate fails, return `undefined` so Pi uses `event.preparation` unchanged.

The native option, no response, an invalid decision, and a stale or ineffective boundary all return `undefined`. Overflow and native manual reasons ignore advisory state. No advisory path returns `{ cancel: true }`.

Offer-time validation alone was rejected because the retained suffix can grow substantially between choice and threshold. Automatically moving a stale choice to another boundary was rejected because it would claim agent intent for a message the agent did not select.

### Share generation while preserving trigger-specific failure policy

Extract the current credential resolution, targeted input construction, validated summary generation, and provenance assembly into a reusable targeted-compaction executor. Its success result remains a Pi `CompactionResult`; failures remain typed so the caller decides policy.

- User `/compact-until` and explicit agent-scheduled compaction retain the current cancel-and-notify behavior.
- Advisory-selected threshold compaction catches resolution, generation, validation, repair, and cancellation failures and returns `undefined` from the hook, allowing Pi's native compactor to run.
- Successful advisory compaction adds compact metadata containing `offerId`, `firstKeptEntryId`, boundary kind, and `trigger: "threshold"`, while retaining existing `compactUntil` metadata and summary-validation usage accounting.

Duplicating summary generation in a new advisory module was rejected because the continuation rubric, repair policy, previous-summary propagation, split-turn handling, and file-operation tracking must remain consistent. Allowing an invalid targeted summary to cancel native threshold compaction was rejected because context pressure is the authoritative safety condition.

### Keep module seams narrow

Refactor toward these modules while retaining one extension composition root:

```text
compact-until.ts
  ├─ manual picker and lifecycle composition
  ├─ advisory-policy.ts       usage threshold and epoch gating
  ├─ compaction-offers.ts     option metrics and deterministic selection
  ├─ advisory-state.ts        persisted offer/decision reconstruction
  ├─ advisory-tool.ts         response validation and recording
  └─ targeted-executor.ts     Pi auth, validated compact call, provenance
       ├─ turns.ts
       ├─ targeted-compaction.ts
       └─ summary-policy.ts
```

Pure policy, selection, and state reconstruction modules accept data and return results without invoking Pi UI or compaction. The composition root owns event registration and notifications. This concentrates Pi lifecycle coupling and makes the deterministic parts testable through the same interfaces used by the extension.

An upstream Pi enhancement that lets `session_before_compact` return an alternate `CompactionPreparation` or preferred `firstKeptEntryId` would remove duplicated credential and compactor orchestration. This change will not depend on that enhancement; all direct coupling to Pi's current positional `compact()` interface remains isolated in `targeted-executor.ts`.

## Risks / Trade-offs

- [The advisory threshold is later than a customized Pi threshold] → Treat advisories as best effort; native compaction proceeds immediately, and document/configure a conservative default.
- [A single tool-heavy turn jumps across both thresholds] → Omit the advisory and preserve native threshold or overflow behavior.
- [Token estimates differ from provider accounting] → Use conservative offer filtering and stricter validation with Pi's resolved settings at trigger time.
- [A preference ages while the retained suffix grows] → Revalidate effectiveness at threshold and fall back rather than moving the boundary.
- [The agent ignores or misunderstands the offer] → Include a native option, keep the message concise, and make absence or malformed responses inert.
- [Persisted metadata adds session entries] → Store bounded IDs, kinds, previews, and estimates only; never duplicate conversation bodies.
- [Validated targeted generation fails after one repair, causing an additional native summarization call] → Accept the rare extra cost to preserve threshold reliability; surface failure in concise diagnostic metadata or notification.
- [Another extension also overrides threshold compaction] → Document load-order sensitivity and keep fallback behavior non-cancelling; do not claim exclusive ownership of the hook.
- [Refactoring shared targeted execution regresses explicit flows] → Preserve existing manual and scheduled-agent contract tests and add adapter-level parity tests before enabling threshold dispatch.
- [A malicious conversation biases the agent's semantic choice] → Options are deterministic, opaque IDs are membership-checked, and the response tool grants no capability beyond selecting an already safe and effective cutoff.

## Migration Plan

1. Add pure offer-selection, epoch-state, and threshold-policy modules with fixture tests while leaving all hooks disabled.
2. Extract the shared targeted executor and prove parity for existing `/compact-until` and scheduled-agent tests.
3. Register the advisory flag and response tool, then enable one-call advisory injection with persisted offer and decision records.
4. Enable threshold-hook consumption behind the same advisory feature path and add native-fallback tests for every rejection and failure mode.
5. Update README usage, configuration, lifecycle notifications, and limitations.

Existing sessions require no migration. They contain no advisory records and therefore retain native threshold behavior. Rollback removes the new tool and hooks; custom advisory entries and tool-result details remain harmless session history, and any completed compaction entries remain standard Pi checkpoints.
