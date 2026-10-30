# Proactive, informed context compaction

## Purpose and status

This design is for maintainers implementing and evaluating context management. It captures the agreed direction after reviewing v0.1.2. Implementation must be verified separately; the recommendations are not evidence of improved task quality.

**Goal:** reduce live context at logical transitions and avoid surprise mandatory compactions that remove critical recent evidence. Pi's native compaction remains a safety net, not the normal execution target.

## Existing behavior and its limitations

The v0.1.2 advisory appears once per compaction epoch at 70% estimated usage. Code offers up to three user-exchange boundaries and one assistant-message boundary, plus native. Choices are spread by retained-token count, not semantic importance. The active task model sees a 96-character preview and token estimates. It records a preference; Pi applies it only when its automatic threshold is reached. The retained suffix is checked again at that time.

That delay retains already-summarizable context, lets decisions become stale, and can make the selected suffix too large. An ignored one-shot offer is not reconsidered. A structurally eligible assistant message is not necessarily a completed milestone. Summary validation checks format, not factual completeness. A cutoff always keeps one contiguous suffix; it cannot pin scattered messages.

## Decision and execution contract

Choosing a prefix as summarizable can authorize proactive compaction. It does not authorize forgetting its important facts or interrupting live tools. Separate semantic judgment from deterministic execution authority:

1. Collect source-grounded evidence and capacity estimates.
2. Let the active model inspect, compact, defer, or choose native.
3. Validate the action, exact offer and option, session, epoch, and current projected context.
4. After the selecting tool batch is persisted, generate a validated summary at Pi 1.2's actionable `turn_end` boundary.
5. Return a compaction draft for Pi to validate and commit. Do not abort the run, mutate session history directly, or force an extra model request.
6. Continue under Pi's normal scheduling rules. On proactive failure, retain context and report why; do not silently choose another cutoff.

Pi 1.2 documents `turn_end` boundary drafts, including compaction, and an event context that includes changes proposed by earlier handlers. If this capability is absent, fail closed rather than compacting through an unsafe fallback. Abort, queued user input, competing boundary mutations, session changes, and stale projections invalidate a pending request. Check again after summary generation. No automatic replay of a pending compaction after reload: require a fresh authorization.

The current preference tool must not silently acquire side effects. Introduce `respond_compaction_advisory` for proactive actions, with a required reason and a preservation list for compact. Keep `choose_compaction_boundary` for explicitly selected legacy threshold mode and old offers only.

## Evidence contract

A compact advisory should identify what changes between choices, not just which message each choice names. Always expose:

- Current usage, pressure band, response reserve, and estimated post-compaction occupancy.
- Estimated net savings after the summary allowance, not just prefix size.
- First retained entry ID and kind; whether the cutoff splits a user turn.
- The enclosing user request and bounded excerpts immediately before and after the cutoff.
- Counts of user messages, assistant messages, and tool results summarized.
- Bounded tool names and file paths found in explicit tool arguments, labeled incomplete where appropriate.
- The additional segment summarized relative to the preceding, more conservative option.

An `inspect_compaction_option` tool returns bounded, paginated source excerpts for a candidate. Inspection must not authorize compaction or permanently repeat advisory prose. Source excerpts are untrusted conversation data, not new instructions. Truncation and incomplete file/tool coverage must be explicit. No separate summarizer or classifier is needed to generate the menu initially; do not invent semantic labels like "resolved investigation" from token counts.

Candidates remain structurally safe and token-diverse. Default selection should prefer user exchanges without treating assistant boundaries as verified milestones. Rank menu IDs by retention, not quality. Keep all token estimates labeled approximate: fixed prompt/tool overhead, provider tokenization, and variable summary size matter.

## Selection rubric and preservation

Choose the **least aggressive** boundary that creates meaningful working headroom while retaining unresolved work and hard-to-reconstruct evidence verbatim. Prefer completed phases, not maximum savings. Keep current hypotheses, exact failures, requirements, and necessary evidence together. Inspect or defer when unsure.

A compact response includes an offer ID, an offered option ID, a short rationale, and a bounded list of facts the summary must preserve. An empty preservation list is allowed only as an explicit judgment that no extra instructions are needed; ordinary summary requirements still apply. Do not use an uncalibrated confidence percentage as permission.

The preservation list is passed to the summarizer. It is not a claim that semantic completeness has been mechanically proven. Structural validation allows one repair attempt; invalid output must never replace context.

## Pressure-aware policy

Use three bands, with numeric defaults treated as initial heuristics to evaluate:

- **Low:** below the reserve-aware moderate band (or explicit override). No unsolicited advisory. Existing intentional milestone tools remain available for optional semantic cleanup, independently of capacity pressure.
- **Moderate:** at/above the advisory threshold. Offer only when a safe option yields meaningful net savings.
- **High:** one runway unit before the estimated native boundary using the persisted model-specific reserve. Escalation from moderate bypasses the normal cooldown; never force a model selection.

Let `N = window - effectiveReserveTokens` and `H = max(16384, 0.05 * window)`. Moderate starts at `max(0, N - 2H)` tokens; high at `max(0, N - H)`. With the ordinary 16,384 reserve the bands are 61.6%/74.4% for 128k, 81.93%/87.95% for 272k, and 88.36%/93.36% for 1M. Percentages can be overridden with `--compact-until-proactive-threshold` and `--compact-until-high-pressure`. Invalid values fall back to derived defaults; both are capped at the native boundary and high is clamped to at least moderate. The former native-minus-ten-percentage-points branch is removed. The separate legacy threshold-mode flag retains its 70% default. These are explicit planning margins, not quality cliffs or optimality claims.

Bound reoffering to three offers per epoch and a two-completed-turn cooldown, except that moderate-to-high escalation bypasses the cooldown (not the cap or opt-out). Reserve the final offer for high pressure so moderate-pressure declines cannot exhaust all opportunities before escalation. A material change means at least five percentage points of usage growth, escalation to high pressure, a new user-exchange boundary, or all previous options becoming stale. A minor assistant message alone must not cause repeated advisories. Native is an explicit opt-out for the epoch. Defer is not failure. Ignored offers may be superseded under the same policy. New offers invalidate previous IDs. Reset the budget after successful compaction.

Capacity policy should include the current retained suffix, estimated fixed-context overhead, an 8,192-token summary allowance, the larger of response capacity and persisted reserve, and an additional max(4,096 tokens, 5% of the context window) margin. Require meaningful estimated net savings, initially max(4,096 tokens, 5% of current usage). Recheck against the actual generated summary before committing. Settings read from disk cannot reveal SDK-only in-memory overrides; report the estimate as such and retain conservative response headroom. Native runtime compaction remains authoritative.

## Actions and fallback

| Outcome | Policy |
| --- | --- |
| Compact accepted | One pending request for the next safe turn boundary |
| Inspect | Return evidence; no compaction or decision |
| Defer | Record reason; reconsider only after cooldown and material change |
| Native | Suppress proactive offers for this epoch; Pi remains unchanged |
| Invalid/stale request | Reject with a stable reason; no state-changing action |
| Abort, queued input, competing edits | Cancel the pending request and retain context |
| Generation/auth/validation failure | Persist a bounded failure category; retain context |
| Mandatory threshold/overflow | Pi keeps its native recovery behavior unless explicit legacy mode applies |

Keep an off mode and a legacy threshold mode for rollback. A proactive request must never be accidentally replayed as a legacy threshold preference. A successful boundary draft advances the compaction epoch; a failed/cancelled attempt is consumed, not retried on every turn.

## Observability and privacy

Persist versioned branch-local offer/decision/outcome records with IDs, pressure, estimated before/after size, action, failure category, and summary latency. Retain provenance on the compaction entry. Do not duplicate full transcripts, auth material, or raw exception messages into telemetry. Offer state should store IDs and numeric metrics; derive excerpts on demand. Records follow ordinary local session retention, with no external telemetry.

Distinguish "summary prepared/draft proposed" from "Pi committed the compaction". A later boundary handler can reject a draft; a prepared summary is not proof of committed history. Native compaction events remain independently observable.

## Priority order

1. Implement proactive execution using verified Pi 1.2 boundary drafts, explicit authorization, abort/queue/staleness guards, and failure retention.
2. Add richer source-grounded comparisons and bounded inspection.
3. Add the least-aggressive-effective rubric and preservation list.
4. Integrate low/moderate/high pressure, explicit defer/native, cooldown, and capped reoffering.
5. Add deterministic regression/replay fixtures and an evaluation protocol before claiming better task quality.

## Verification and evaluation

Automated tests must cover tool result-before-compaction ordering, no nested compaction, continued task execution without forced loops, old/invalid/off-branch offers, context edits, model/window changes, competing handlers, queued input before and during generation, aborts, duplicate calls, reload, malformed summary repair, and native fallback isolation. Verify evidence bounds and pagination, option deltas, net-savings arithmetic, fixed overhead, pressure transitions, cooldown, budget exhaustion, and native opt-out.

Run a real Pi 1.2 boundary smoke test with a local fake provider rather than relying only on mocked handlers. Retain the older development dependency tests as compatibility evidence, not proof of the new lifecycle contract.

Compare three policies on recorded debugging sessions: native cutoff, v0.1.2 delayed preference, and proactive informed selection. Hold provider/model and tasks constant. Measure mandatory compaction frequency, estimated versus actual occupancy, rejected/stale choices, rereads and repeated hypotheses, lost constraints, task success, latency, summarization tokens, and total cost including cache effects. Synthetic fixtures prove mechanics only; they cannot establish semantic quality.

Start with offline replay, then opt-in/shadow review of choices, then limited real use. Broader rollout requires no observed tool/history corruption, no automatic continuation loops, acceptable preservation of critical facts on a held-out set, and evidence of reduced surprise compactions without unacceptable task/cost regressions. No numeric quality gain is asserted before running that comparison.

## Non-goals

No automatic semantic classifier, arbitrary history deletion, scattered-message pinning, background provider calls merely to rank options, forced compaction on model silence, or changes to Pi's core threshold/recovery policy. No release or global installation change is implied by implementation work.

## Reported runtime race to verify

The operator reported `Extension "<runtime>" error: Cannot submit a prompt while compaction is in progress. Wait for compaction to finish and retry.` around scheduled compaction and advisory selection in the installed v0.1.2. The preference tool itself does not start compaction. The exact producer of the competing prompt is not yet established. Verify ordinary tool continuation and other extensions' queued follow-ups before calling this fixed; do not treat a mock-only successful callback as evidence. The proactive boundary-draft path avoids fire-and-forget compaction, while the existing deliberate milestone scheduling path also requires scrutiny.

The split-prefix repair omission was reproduced against the real native compactor: a local stream returned malformed turn sections until it saw repair feedback, and v0.1.2 failed with the operator's exact missing-heading pair. Pi passes `customInstructions` only to history generation, not its separate turn-prefix request. The fix delivers focus/repair requirements through the session stream for split summaries, while preserving provider options and strict structural validation. This establishes a concrete repair-path defect, not the exact contents of the operator's rejected summaries. A scheduled-compaction test with an `agent_settled` follow-up did not reproduce the separate prompt error; its original triggering integration remains unconfirmed.

## Local verification commands and interpretation

- `npm test` runs deterministic policy, evidence, lifecycle, legacy, summary validation, and mechanical replay tests.
- `npm run typecheck` checks against the repository's development SDK.
- `node scripts/verify-pi12.mjs <installed-pi-package-path> proactive` runs a real Pi 1.2 session with a local fake provider: persisted selection result, summary, committed draft, normal continuation.
- The same command with `scheduled` tests deliberate scheduling plus another extension's settled follow-up.
- `queued` injects user input during generation and requires context retention rather than committing the draft.
- `split-repair` returns malformed split headings first, then requires preservation and repair feedback on the real Pi 1.2 prefix request before returning a valid summary.

The smoke harness uses an isolated temporary agent directory, in-memory session, and local provider, with networking disabled. It does not change the global installation. A supplied runtime is required; it never installs one automatically.

The mechanical replay tests contrast native cutoff, delayed selection, and immediate eligibility on identical synthetic histories with small versus large subsequent suffix growth. They demonstrate why a deferred choice can become ineffective; they do not establish that the model chose a semantically good boundary. Real task-quality, cache-cost, and held-out session evaluation remain a rollout gate, not a completed experiment.

## Threshold research follow-up

See [compaction-threshold-research.md](compaction-threshold-research.md) for source-backed reasoning across 128k, 272k, and 1M windows, including effective per-model reserves. It recommends replacing universal 60/75 capacity-pressure bands with explicit runway margins and separating capacity pressure from optional semantic cleanup. The runway defaults and high-escalation cooldown exception are now implemented in the working tree; optional earlier semantic cleanup remains available through the intentional milestone tools. Per the operator's clarification, experiments are not a prerequisite for justifying and selecting these threshold defaults.

## Native-threshold regression and competing-prompt investigation

`node scripts/verify-native-threshold-pi12.mjs <installed-pi-package-path> baseline <v0.1.2-extension-entry>` loads the installed extension read-only into an isolated offline session and reproduces the reported native-threshold warning verbatim. The fixture rehydrates a persisted legacy offer/decision, then lets real Pi trigger automatic compaction; it does not call the compaction handler directly. `repair` against the working tree verifies that repair feedback reaches the split-prefix request, the selected boundary commits, and continuation retains the exact recent evidence. `fallback` forces two invalid targeted summaries and requires ordinary native compaction to succeed instead. Both paths assert original raw history is unchanged. The native-threshold issue is therefore covered by the existing split-prefix instruction fix; no additional relaxation of validation is needed.

The installed Pi 1.2 `agent-session.js` routes extension `sendUserMessage()` through `prompt()`. Outside the special `agent_settled` scope, it rejects while the manual-compaction controller is active **before** handling streaming delivery mode. Thus `deliverAs: "followUp"` alone does not make submission safe in that situation. Within `agent_settled`, however, Pi defers prompts before checking the compaction guard: injecting a prompt during an awaited scheduled summary did not reproduce the guard error. The runtime binding labels rejected submissions `<runtime>` / `send_user_message`, obscuring the producing extension's identity. `manual-race` in `scripts/verify-pi12.mjs` deliberately submits during manual compaction outside the settled scope and expects the specific runtime rejection; this is a reproduction, not a fix. The normal `scheduled` case expects no errors. Identifying and fixing the operator's actual competing producer still requires the original triggering integration; neither the summary repair nor this controlled reproduction proves that producer is fixed.

## Agent scheduling gate (v0.2.1)

`schedule_compaction` now requires usage at or above the same effective moderate-pressure threshold, including explicit threshold overrides and model-specific reserves, regardless of advisory mode. Below-threshold or unknown capacity declines without changing pending state. The gate is rechecked when the run settles, preventing a changed model/window or reduced context from executing a now-premature request. Earlier statements about unrestricted intentional milestone tools describe v0.2.0; explicit user `/compact` and `/compact-until` commands remain unrestricted, but agent scheduling does not. This prevents autonomous scheduling around 40% on a 272k/22k-reserve model whose moderate threshold is approximately 79.86%.

## Cache-stable advisory delivery

Both proactive and legacy offers now use `tool_result`, not a one-call `context` transformation. The extension appends a labeled text block to a successful top-level result before Pi persists it, preserving original result content, structured output, details, usage and error semantics. Nested results are skipped because parents can discard them. Policy evaluation waits for a successful top-level result; it does not manufacture tool calls or force a model continuation. Native compaction remains the safety net when no eligible tool completes.

Pi replays the persisted result unchanged after inspection, silence, defer, native selection, supersession, reload and failed compaction. There is no synthetic user-turn boundary and no disappearing or relocated advisory. Committed compaction still intentionally replaces the prefix. Offers already emitted by older one-shot versions cannot be reconstructed exactly and are not retroactively inserted. This change removes known extension-side cache risks; actual provider cache hits are not guaranteed by offline prefix tests.

Offline verification: `node scripts/verify-advisory-cache.mjs <installed-pi-package-path> proactive <ignore|defer|native|failed|supersede>` runs a real session with a fake provider and checks each main request through Pi's OpenAI Responses serializer. It asserts append-only input, no artificial user turns, unchanged persisted result content, and the same prefix after rebuilding context from session entries. Use `threshold ignore` or `threshold native` for legacy delivery. An optional final extension path permits read-only regression checks against an older installed release. These checks do not measure paid provider cache hits.

### Confirmed Pi 1.4 context-hook folding mechanism

Two live misses in the pi-compact-till development session occurred on old advisory-bearing requests, with cache reuse returning on intervening ordinary requests and no compaction. Offline replay of both histories through the installed `ExtensionRunner.emitContext()` showed two system messages collapsing to one when the advisory changed the conversation list. `restoreSystemMessages()` calls `getCurrentSystemMessage()` for changed lists, folding incremental prompt/tool state into the leading message. With the stored OpenAI model's mid-conversation system support, this changes the first serialized input item. Earlier serializer-only replay omitted both that hook and its compatibility option and therefore did not test the actual path.

`node scripts/verify-context-folding.mjs <installed-pi-package-path>` reproduces that mechanism using synthetic input, then verifies the new tool-result delivery through the same runner without folding. The full advisory-cache harness also seeds historical system state and enables mid-conversation system/tool serialization. Provider-side cache routing may still affect hits; these tests establish the concrete client-side invalidation mechanism and its removal, not guaranteed billing outcomes.
