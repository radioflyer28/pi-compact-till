# v0.2.2

## Cache-stable advisory delivery

Proactive and legacy threshold advisories now append once to a successful top-level tool result before Pi persists it. They no longer rewrite the conversation through a `context` hook, introduce synthetic user messages, or disappear after the advisory response. Original tool content, structured output, and metadata are preserved. Answered or superseded offers remain historical at their original position until normal compaction removes them.

This avoids a reproduced Pi 1.4 cache-prefix invalidation mechanism: changing the conversation in a `context` hook folds incremental system instructions and tool declarations into one leading system message. In two observed advisory-associated misses, offline replay through the real hook changed the first serialized provider input item. Ordinary requests immediately afterward resumed cache reuse. The earlier serializer-only replay did not exercise that hook or the model's mid-conversation-system compatibility setting.

Offers now wait for an eligible successful tool result. Nested results and errors do not consume offers; when no eligible tool completes, native automatic compaction remains available. Actual compaction still intentionally replaces earlier context. Provider cache hits and billing savings are not guaranteed.

## Optional diagnostics

`--compact-until-cache-diagnostics` enables local, content-free request fingerprints and main-response usage records. It is off by default and records no prompt text, tool arguments, credentials, raw provider responses, or headers. See the [README](../README.md#opt-in-cache-diagnostics) for supported observations and limitations.

## Verification

Regression coverage includes real Pi 1.4 offline serialization with incremental system/tool history, ignored/deferred/native offers, failed compaction, superseded offers, and persisted-context reconstruction. A separate synthetic regression reproduces the old system-folding behavior through Pi's actual extension runner and verifies the new delivery path. These checks use a fake provider, not paid model calls. Lifecycle coverage also includes successful compaction, queued-input cancellation, split-summary repair, and scheduled execution.

## Upgrade

```bash
pi install git:github.com/radioflyer28/pi-compact-till@v0.2.2
```

Wait for active compaction to finish or fail, then `/reload` or restart existing sessions. Publishing the tag does not update an installed package or an extension already loaded in memory. Existing pinned releases remain unchanged. No global reserve/configuration change or npm publication is implied. The competing-prompt limitation documented in [v0.2.0](release-v0.2.0.md) remains open.
