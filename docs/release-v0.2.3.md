# v0.2.3

## Shared agent-compaction safeguards

Scheduled and proactive compaction now share moderate-pressure, minimum net-savings, and headroom checks. Eligibility is checked when authorizing a cutoff, again before execution, and after generation using the actual summary size and current capacity. Scheduled compaction conservatively uses the larger of the native preparation reserve and current persisted reserve; reserve changes during generation are rechecked. Invalid or ineffective cutoffs are declined with explicit reasons rather than creating an ineffective compaction.

Queued input, aborted signals, changed sessions/models/context, and ineffective generated summaries prevent agent-directed results from being applied. Human `/compact` and `/compact-until` commands remain outside these agent-only gates. Native threshold and overflow recovery remain separate, as do legacy threshold-advisory fallback semantics. Retained suffixes remain contiguous, with safe tool-call/result boundaries.

## Pi 1.5 runtime authentication

Targeted summaries now use session-owned registry streams without pre-resolving credentials and reinjecting them as explicit API keys. This lets the runtime preserve the distinction between stored OAuth and an explicit key, along with auth-selected endpoints, header deletion, provider environment, configured thinking level, and virtual-model routing/physical output limits. Older hosts without that stream capability retain the explicit-auth fallback, now including the auth-selected endpoint.

The offline auth regression has a negative control that fails when synthetic stored OAuth is echoed as an explicit key. The corrected path passes through the real Pi 1.5 compactor and model runtime, including structural summary repair. This demonstrates the integration contract; it is not a live-provider OAuth test or evidence that every provider was affected.

## Semantic evaluation foundation

Six synthetic continuation probes, authored positive/negative controls, paired-run validation, and an offline scoring CLI are available in the development checkout. See the [evaluation guide](semantic-evaluation.md) and [roadmap](roadmap.md). Structural headings cannot establish factual retention; these tools prepare future evidence rather than claim a semantic fix. No paid model evaluation, improved retention, optimal policy, cache-hit guarantee, or dollar-saving result is claimed.

## Verification and compatibility

- Unit suite: 179 passed, 1 skipped; typecheck and whitespace checks passed against the pinned development dependencies.
- Real Pi 1.5.0 offline coverage: proactive, scheduled, low-pressure and ineffective-scheduling declines, queued-input cancellation, split-summary repair, and the controlled competing-prompt race. The race scenario expects the known rejection; it does not claim to fix an unidentified prompt producer.
- Stored OAuth/API-key regression: request-time auth, endpoints, header deletion, thinking level, repair, virtual routing, and explicit output-budget clamping to physical limits.
- Six authored positive/negative semantic control pairs, cache-prefix/persistence scenarios, context-folding regression, and package dry-run.

Pi 1.5.0 is the tested runtime baseline for this release and future checks. Pi 1.2 verification is no longer maintained. Older-host guards and fallback code remain best effort; the manifest does not introduce a new enforced version restriction. The lifecycle harness retains its historical `scripts/verify-pi12.mjs` name but is run with the Pi 1.5 package path. All provider checks are offline with synthetic inputs and credentials; no paid inference or global installation change is required.

## Upgrade

```bash
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.3
```

For project-local installation, add `-l`. Wait for active compaction to finish or fail, then `/reload` or restart existing sessions. Publishing this tag does not update a pinned package or code already loaded in memory. Existing release tags remain unchanged. No npm publication or global settings change is implied. The competing-prompt limitation documented in [v0.2.0](release-v0.2.0.md) remains open.
