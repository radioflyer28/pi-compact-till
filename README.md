# pi-compact-till

Choose the first Pi message to retain so newer working context remains verbatim.

## Install

Install the pinned Git release globally for Pi (proactive mode requires Pi 1.2+):

```bash
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.2
```

Install it for only the current Pi project:

```bash
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.2 -l
```

To try a local checkout without installing it:

```bash
pi -e .
```

After upgrading an already-running session, wait for any active compaction to finish or fail, then run `/reload` (or restart Pi). Updating files on disk does not update an extension already loaded in memory. See [v0.2.2 release notes](docs/release-v0.2.2.md) for cache-stable advisory delivery, [v0.2.1 release notes](docs/release-v0.2.1.md) for the scheduling gate, and [v0.2.0 release notes](docs/release-v0.2.0.md) for the remaining prompt-submission caveat.

## Use

Run:

```text
/compact-until [summary focus]
```

Every picker choice is the **first message retained verbatim**. The default view lists user-message boundaries that follow completed user exchanges; choosing one summarizes that preceding exchange, including its assistant replies and tool activity, while keeping the selected user message and everything after it.

Press `a` while the picker is open to reveal **agent checkpoints** as well. These are safe assistant-message boundaries inside a long user request. Press `a` again to return to the quieter user-exchange view. In non-terminal Pi dialog modes, choose **Show agent activity** or **Show only user exchanges** instead.

In the terminal picker, press `i` to inspect the full message behind the currently highlighted boundary. This opens a read-only detail panel without selecting a boundary or starting compaction; move to another row or close the picker to dismiss it. The `i` hotkey is terminal-only because non-terminal dialogs do not expose a highlighted row.

Selecting any item means **keep context starting from this message**: earlier active context is summarized, while the selected message and all later context remain verbatim. An agent checkpoint retains an assistant tool call together with its following tool results; tool-result entries are never selectable. Pi summarizes the earlier part of that same user request as split-turn context, so the retained suffix still has the request and progress it needs.

Supplying optional text focuses the generated summary, for example:

```text
/compact-until Preserve current architecture, changed files, and next steps.
```

Native `/compact` and overflow recovery remain unchanged. Automatic threshold compaction remains controlled by Pi, but the advisory described below can supply a revalidated first-retained boundary. A later compaction can summarize the retained tail under Pi's normal rules.

## Agent-directed compaction

The package also gives the Pi agent two tools for deliberate context management. They build on the same safe user and agent boundaries exposed by the `a` picker view.

- `list_compaction_boundaries` returns safe retained-boundary IDs, their kind, and a concise preview.
- `schedule_compaction` accepts one returned `firstKeptEntryId` plus optional `summaryFocus`, but only at or above the effective moderate-pressure threshold. Below that threshold it declines without creating a pending request. Missing capacity/settings also prevents scheduling. This gate applies in proactive, threshold, and off advisory modes.

The agent should discover boundaries first, then schedule compaction only after a meaningful transition—such as a completed investigation, passing tests, or archiving an OpenSpec change. Scheduling does not interrupt the current run and does not ask for user confirmation. Once the agent run settles, the package revalidates the selected boundary and pressure threshold, and compacts only when there is no queued user input. Explicit user `/compact` and `/compact-until` commands remain unrestricted by this agent-only gate.

Pi notifies you when agent-directed compaction is scheduled, completes, is cancelled, or fails. Native `/compact`, automatic threshold compaction, and overflow recovery remain unchanged unless an agent-directed request has reached its triggering phase.

## Proactive compaction advisory (Pi 1.2+)

The default advisory now asks for an explicit proactive decision, rather than a cutoff to save for mandatory compaction. Proactive and legacy advisories are appended once to a successful **top-level tool result**, before Pi persists it. They do not inject a user message or rewrite the system prompt. If no tool completes, the offer waits; native automatic compaction remains available. Nested tool results and errors do not consume an offer. The labeled advisory remains in its original result after inspection, defer, native selection, failure, or silence, until normal compaction removes that part of history. Answered and superseded offers are historical, not new instructions. At moderate pressure (derived from the model window and effective native reserve), the active model sees a bounded menu with source excerpts, summarized-message counts, differences between choices, projected occupancy, and estimated **net** savings. Options retain one contiguous suffix; earlier context is summarized, not simply forgotten.

The rubric is to choose the **least aggressive effective boundary**, keeping unresolved work and hard-to-reconstruct evidence verbatim. Assistant-message boundaries are structurally eligible, not verified milestones. Quoted excerpts are conversation data, not instructions. `inspect_compaction_option` returns bounded, paginated evidence for an offered option.

`respond_compaction_advisory` accepts:

- `compact`: exact `offerId` and `optionId`, a `reason`, and a `preserve` list of older facts for the summary (explicitly empty if no extra instructions are needed). This authorizes compaction at the next safe completed turn/tool batch, **not** at Pi's mandatory threshold.
- `defer`: a reason; decline for now and permit reconsideration after cooldown and material change.
- `native`: a reason; suppress proactive offers until the next compaction epoch and leave Pi in control.

Silence never authorizes compaction. Let `N = contextWindow - effectiveReserveTokens` and `H = max(16384, 5% of contextWindow)`. Moderate pressure starts at `max(0, N - 2H)` tokens; high starts at `max(0, N - H)`. With Pi's default reserve, this gives approximately **62%/74% for 128k, 82%/88% for 272k, and 88%/93% for 1M**. Per-model reserves change these values. These are reasoned capacity margins, not model-quality cliffs; explicit user commands remain available for optional earlier cleanup; agent scheduling requires at least moderate pressure.

Ignored/deferred offers may be replaced after two completed turns plus meaningful pressure growth, a new user-exchange boundary, or stale options. Escalation from moderate to high bypasses that cooldown, but never the opt-out or offer cap. There are at most three offers per epoch, with the final offer reserved for high pressure. Explicit percentage overrides below replace the derived bands: invalid values use derived defaults, high is raised to at least moderate, and both are capped at the native boundary. The old native-minus-10-percentage-points override is removed. See [threshold research](docs/compaction-threshold-research.md) for the rationale.

```bash
pi --compact-until-proactive-threshold 60 --compact-until-high-pressure 75
```

Accepted compaction runs through Pi 1.2's actionable `turn_end` draft API after tool results are recorded. The extension rechecks session, projected content, model, queue, capacity and generated summary size. It does not abort the agent or force a continuation. Proactive failure leaves context unchanged; it never substitutes an unapproved cutoff. Native threshold/overflow handling remains available. Pending requests are not replayed after reload. Summary validation is structural, not proof of factual completeness.

Capacity estimates include an 8,192-token summary allowance, estimated fixed overhead, response/persisted reserve headroom, and a safety margin. Persisted settings do not expose SDK-only in-memory overrides, and provider tokenization can differ; estimates are not guarantees.

### Opt-in cache diagnostics

To investigate a miss **in the affected session**, start or resume that session with the updated extension loaded and `--compact-until-cache-diagnostics`. This is off by default; enabling it in a different session does not instrument the affected one. Start capture before the next advisory so there is a preceding request to compare.

When the affected session still uses an older installed release without this flag, load **only** `extensions/cache-diagnostics.ts` from this checkout with `-e <absolute-path-to-cache-diagnostics.ts>` alongside the installed package, and add `--compact-until-cache-diagnostics`. Resume the affected session using Pi's normal session selector. Do not load this standalone module when the full updated extension is already loaded: it registers the same diagnostic flag and hooks.

Diagnostics are stored locally in the session JSONL as `custom` entries of type `compact-until-cache-diagnostic-v1`, excluded from model context. They record request attempts, advisory presence, input-item/prefix counts, keyed fingerprints, allowlisted reasoning/cache settings, provider-reported effective reasoning context when available, and main-response token usage. No prompt text, tool arguments, raw provider events, response IDs, or headers are written. Fingerprint keys remain in memory and reset on session start/reload; comparisons do not span those resets. Up to eight attempts and 8,192 item fingerprints are retained in memory; capped prefix comparisons are explicitly unknown.

`previousPrefixPreserved: true` with `settingsChanged: false` rules out a change in the observed serialized prefix/settings, **not** provider-side rendering, cache eviction or routing. `effectiveReasoningContext: current_turn` can help investigate synthetic user-message boundaries; a missing field means the provider did not expose it to this observer, not that `all_turns` was used. Hooks observe their registration position: later handlers can still change requests. Unsupported payloads are labeled, not guessed. Main-turn capture closes at assistant `message_end`, before tool execution and compaction summarization. This instrumentation does not change advisory delivery, cache settings or model behavior, and is not a cache-miss fix.

Offline lifecycle verification: `node scripts/verify-pi12.mjs <installed-pi-package-path> proactive --cache-diagnostics`. The fake provider does not emit HTTP payload hooks; unit tests cover payload fingerprints and raw response metadata separately.

Restart without the flag to disable capture. Existing diagnostic entries follow normal session-file retention. Do not enable raw `/debug-provider` logging as a substitute if prompt/response privacy matters.

### Rollback and legacy mode

```bash
pi --compact-until-advisory-mode off
pi --compact-until-advisory-mode threshold --compact-until-advisory-threshold 70
```

`off` disables advisory behavior but keeps manual/milestone tools. `threshold` preserves the v0.1.2 behavior: one offer at 70%, `choose_compaction_boundary` records a preference without starting compaction, and only automatic threshold compaction consumes it. This legacy tool does not authorize proactive execution. Older Pi runtimes fail closed in proactive mode; use threshold mode instead.

## Proactive compaction design

See [Proactive, informed context compaction](docs/proactive-compaction.md) for the design, pressure policy, implementation priorities, and evaluation plan.

## Development

The package uses documented Pi extension APIs. Unit tests/typecheck use the pinned development SDK; proactive boundary execution additionally requires the real Pi 1.2 smoke test described in the design document. No task-quality improvement is claimed from synthetic tests alone.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:dry-run
pi -e .
```
