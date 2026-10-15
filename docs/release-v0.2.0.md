# v0.2.0

## Default behavior change

Proactive advisory mode is now the default on Pi 1.2+. Accepting an offer authorizes a compaction draft at the next safe completed tool/turn boundary, before continuation. It no longer means merely saving a preference for the next native threshold. Legacy preference behavior remains available with `--compact-until-advisory-mode threshold`; `off` disables advisories. Intentional milestone and manual picker tools remain available.

New tools: `inspect_compaction_option` provides bounded source evidence; `respond_compaction_advisory` accepts explicit compact/defer/native decisions and preservation instructions. Silence never authorizes compaction. Queued input, stale context, competing drafts, and inadequate savings/headroom prevent the proposed operation.

## Reserve-aware pressure

Let `N = window - effectiveReserveTokens` and `H = max(16384, 5% of window)`. Moderate begins at `max(0, N - 2H)` tokens, high at `max(0, N - H)`. With Pi's ordinary reserve, this gives 61.6%/74.4% for 128k, 81.93%/87.95% for 272k, and 88.36%/93.36% for 1M. Actual model-specific reserves apply. Explicit percentage overrides remain supported; the former native-minus-ten-points rule is removed. High escalation bypasses cooldown but not the three-offer cap or native opt-out.

See [threshold research](compaction-threshold-research.md) for assumptions and reasoning. These are capacity margins, not claims of model-quality cliffs.

## Split-summary repair fix

Pi generates history and split-turn prefix summaries separately. Its custom-instructions argument does not reach the prefix request. This release forwards preservation instructions and structural repair feedback through the session stream, without relaxing required headings. It also preserves an existing summary when a repeated split compaction has no new history.

The real Pi 1.2 native-threshold regression reproduces the exact missing `Early Progress` / `Context for Suffix` warning with v0.1.2, then verifies successful repair in this release. When both targeted summaries remain invalid, native threshold fallback still works and original raw history is unchanged. Deliberate targeted compaction instead cancels on failure; it does not silently choose a different cutoff.

## Known prompt-submission limitation

An extension calling `sendUserMessage`, even with `deliverAs: "followUp"`, during manual compaction outside Pi's settled-event deferral scope can receive `Cannot submit a prompt while compaction is in progress`. The controlled `manual-race` regression deliberately expects that rejection; it is not a fix. Normal awaited scheduled compaction and settled follow-up pass without that error.

The operator's reported incident occurred before a confirmed `/reload`. The session began before the v0.1.2 installation, and v0.1.1 did not await scheduled compaction completion. Stale loaded code is therefore plausible, not proven. The exact original prompt producer remains unconfirmed; do not interpret this release as a demonstrated fix for every competing-prompt integration. TODO #13 remains open.

## Verification

The release checks include typecheck, unit/regression tests, and offline real-Pi scenarios for proactive execution, scheduled follow-up, queued-input cancellation, split-prefix repair, the expected manual prompt guard, native-threshold v0.1.2 reproduction, native-threshold repair, and safe native fallback. The harness uses isolated temporary sessions and a local fake provider, not live model calls. These checks establish lifecycle behavior and structure, not semantic summary completeness or measured quality/cost improvements.

The development lockfile's direct-dependency specifiers now match the already-pinned package manifest; resolved dependency versions are unchanged.

## Installation and activation

```text
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.0
```

Wait for existing compaction to finish or fail before `/reload` or restarting an active Pi session. This release does not change global compaction reserve settings. Unrelated local OpenSpec skill deletions are excluded from the release commit. Distribution is by Git tag; no npm publication is implied.
