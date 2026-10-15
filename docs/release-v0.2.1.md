# v0.2.1

## Prevent premature autonomous compaction

`schedule_compaction` now requires current usage at or above the effective moderate-pressure threshold. It uses the same reserve-aware calculation and explicit percentage overrides as proactive advisories. The gate applies in proactive, threshold, and off advisory modes.

- Below threshold, scheduling declines without creating pending state.
- Unavailable capacity/settings also prevents scheduling.
- Pressure is rechecked when the run settles, before executing the scheduled request.
- Explicit user `/compact` and `/compact-until` commands remain unrestricted.

For a 272,000-token window and a 22,000-token reserve, the default moderate threshold is 217,232 tokens (approximately 79.86%). Autonomous milestone scheduling at 40% is therefore declined.

## Scope and limitations

This is a timing safeguard, not a guarantee of economic benefit. Adding the proactive path's net-savings/headroom checks to scheduled compaction remains a follow-up. No new below-threshold exception is introduced. The competing-prompt limitation documented in [v0.2.0](release-v0.2.0.md) remains open.

Regression coverage includes below-threshold rejection, exact-boundary admission, missing capacity, execution-time revalidation, explicit overrides, all advisory modes, and manual user compaction below threshold. The real Pi 1.2 `scheduled-low` scenario verifies normal continuation with zero compactions; the above-threshold scheduled scenario verifies successful compaction and continuation.

## Upgrade

```text
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.1
```

After installation, wait for any active compaction to finish or fail, then `/reload` or restart existing Pi sessions. Publishing the Git tag alone does not update a globally pinned installation. No npm publication is implied.
