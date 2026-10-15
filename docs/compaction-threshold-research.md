# Research: pressure thresholds across context-window sizes

Research date: 2026-10-15. Scope: installed Pi 1.2.0 and the current working-tree proactive policy. This is research and design reasoning, not an experiment report. No implementation defaults or user settings were changed. Experimental validation is not a prerequisite for choosing these policy defaults.

## Conclusion

A universal 60% moderate / 75% high policy is not well justified as a **capacity-pressure** policy. It is quite defensible for a 128,000-token window with Pi's ordinary reserve: it provides approximately 35k / 16k tokens of runway before native compaction. It starts much earlier relative to available runway at 272k and especially 1M.

However, avoiding overflow is not the only reason to compact. Removing obsolete work can improve relevance, cost, and latency even with ample free capacity. Conversely, compression can lose important facts and disrupt cache reuse. Published guidance supports this trade-off, not a universal degradation cliff at either 60% or 75%.

Recommendation: separate **capacity pressure**, computed from the effective native boundary and explicit runway margins, from **optional cleanup at a completed phase**. Do not tell a 1M model that 750k tokens is necessarily an imminent capacity problem. Do not tell it that it should always keep all history until 930k either.

## 1. What Pi actually does

The installed runtime's `dist/core/compaction/compaction.js:173-176` implements:

```text
native compaction condition: enabled && contextTokens > W - R
W = the active model's context window
R = its effective configured reserveTokens
N = W - R = native trigger boundary
```

The built-in reserve is 16,384 tokens. Exact provider/model overrides and global/project settings can change it. Pi checks projected context after tools before another assistant response, before new prompts, and has overflow/length recovery. Thus the native boundary is an operational threshold, not a model-quality guarantee or an exact provider-token-count promise. [S1]

Use the actual model metadata: 128,000 is not 131,072, 272,000 is not 262,144, and 1,000,000 is not 1,048,576. All tables below use the decimal sizes in the question. `keepRecentTokens` selects the retained suffix; it does not determine the native trigger.

### Default-reserve comparison

| Window W | Native boundary N | Native percent | 60% advisory | Runway from 60% to N | 75% advisory | Runway from 75% to N |
|---|---:|---:|---:|---:|---:|---:|
| 128,000 | 111,616 | 87.20% | 76,800 | 34,816 | 96,000 | 15,616 |
| 272,000 | 255,616 | 93.98% | 163,200 | 92,416 | 204,000 | 51,616 |
| 1,000,000 | 983,616 | 98.36% | 600,000 | 383,616 | 750,000 | 233,616 |

The user's approximately 93% description is close for a 272k window, but is not a general Pi constant. A 20k reserve would put that window at 92.65%; the built-in 16,384 reserve gives 93.98%.

### Installed settings matter more than the window label

I read only the relevant model metadata and compaction settings from `~/.pi/agent/models.json` and `~/.pi/agent/settings.json`. This checkout has no project `.pi/settings.json` at research time. Other projects or runtime configuration can differ.

| Configured model/group | Window | Reserve | Native boundary | Native percent |
|---|---:|---:|---:|---:|
| VT-ARC gpt-oss-120b variants | 128,000 | 64,000 | 64,000 | 50.00% |
| VT-ARC GLM-5.3 variants | 128,000 | 32,768 | 95,232 | 74.40% |
| OpenAI models with the configured 22k override, **if** their active window is 272k | 272,000 | 22,000 | 250,000 | 91.91% |
| VT-ARC DeepSeek-V4.1-Flash variants | 1,000,000 | 32,768 | 967,232 | 96.72% |

The custom 128k and 1M window values above were verified from local metadata. The 272k row is conditional: the OpenAI override was verified, but no particular active OpenAI model/window was assumed from its name. These local configuration observations are not claims about provider-advertised capabilities.

The 64k reserve on a 128k model is particularly consequential. It already intentionally leaves half the window unused at the native boundary. Raising advisory percentages without accounting for it would place advisories after native compaction. Review the purpose of that reserve separately; do not silently reduce it as part of advisory tuning. Pi's reserve also affects summarizer output budgets, so changing it has more than one effect. [S1]

## 2. What the research supports

### Earlier cleanup can help, but summarization has a cost

Anthropic's context-engineering guidance describes performance as a gradient, not a hard cliff, and recommends small, high-signal contexts. It also explicitly warns that overly aggressive compaction can discard subtle but critical information. Its suggested preservation targets—decisions, unresolved bugs, implementation details—fit this extension's preservation requirements. It does not prescribe 60% or 75%. [S2]

Google's long-context documentation says multi-needle retrieval can be substantially less reliable than single-needle benchmarks, with performance varying by context. It recommends avoiding unnecessary input and notes that longer queries generally increase time to first token. This supports retiring irrelevant history, not treating an advertised 1M window as uniformly effective working memory. It does not establish that summarizing necessary evidence at a particular percentage improves an agent's results. [S3]

Chroma's original Context Rot study varies input length while holding simple task complexity constant, across 18 models, and reports nonuniform degradation and distractor effects. It is primary research, but the evaluated 2025 models and tasks are not the operator's entire current model set or this coding workflow. It supports caution about long history; it cannot supply a calibrated percentage for these models. [S4]

### Production APIs support earlier, absolute-token compaction policies

Anthropic's threshold-compaction API documents a **150,000 input-token default**, configurable down to 50,000. OpenAI's compaction guide demonstrates **200,000 tokens** as a configurable threshold. The first is an API default; the second is an example, not a universal recommendation. Both are absolute token values, not a rule saying to wait until 93–98% full. [S5, S6]

These are not interchangeable with this extension: OpenAI returns an opaque encrypted state item that can carry reasoning state, while Pi uses a textual checkpoint plus retained history. Their examples justify the legitimacy of earlier compaction, not the fidelity of our summaries or the optimality of their numbers for Pi.

### Cache behavior argues against gratuitous compaction

OpenAI explicitly documents that compaction can change the prefix and reduce cache reuse on subsequent requests. Anthropic documents an extra sampling/billing step and caching of newly generated summaries, while recommending separate system-prompt cache boundaries. [S5, S7]

Therefore fewer live tokens does not automatically imply an immediate cost win. Account conceptually for the summary request, cache rebuild, any necessary rereads, and the number of subsequent turns that benefit. Conversely, cache reuse does not remove the relevance/reasoning risks of a large stale history.

## 3. Assessment of 60% / 75% by window

### 128k: reasonable with the ordinary reserve

At 60%, about 35k tokens remain before native compaction; at 75%, about 16k remain. That naturally represents an early opportunity to finish a phase followed by a stronger suggestion with roughly one bounded work-cycle budget left.

For example, **assuming** approximately 16k of additional context per assistant/tool cycle, those are about 2.1 and 1.0 cycles respectively. This is transparent sizing reasoning, not a measured growth rate. Tool batches, pending messages, reasoning accounting, and output limits can make growth larger or smaller.

Verdict: 60/75 is defensible as a rounded conservative policy for this window **when R is near 16k**. It cannot be applied unchanged to the operator's 32,768/64,000 reserve overrides.

### 272k: 60% is an early cleanup opportunity, not capacity pressure

The same percentages leave about 92k and 52k tokens before the default native boundary: about 5.6 and 3.2 hypothetical 16k cycles. This is plenty of space to finish substantial work. With the operator's 22k reserve, the runway is still 86,800 / 46,000 tokens.

A 163k invitation can be sensible when an investigation has ended and earlier output is obsolete; Anthropic's 150k default provides useful precedent for that kind of context-management choice. But labeling 204k as **high capacity pressure** is difficult to defend without a known upcoming large batch. With a 22k reserve, approximately 80% / 86% is a better capacity-driven starting point under the rule below.

Verdict: keep the ability to compact early at a meaningful boundary, but do not make 60/75 the universal pressure schedule.

### 1M: percentages alone are a poor proxy for both urgency and quality

At 75%, the ordinary native boundary is still about 234k tokens away—more than 14 hypothetical 16k cycles. Calling that high capacity pressure is misleading for routine bounded work. At 60%, about 384k remain.

On the other hand, 600k or 750k of stale debugging history can be unwieldy even though it fits. Moving every compaction decision to 95% would conflate storage capacity with useful working context. A legitimate large reference corpus may be valuable verbatim; a long accumulation of obsolete tool output may not be. The source guidance supports making that distinction. [S2–S4]

Verdict: move capacity-driven escalation later, while allowing voluntary semantic cleanup earlier. With the operator's 32,768 reserve, approximately 87% / 92% is a reasonable capacity schedule under the rule below—not a claim that 920k is an optimal working-context size.

## 4. Recommended rule and explicit assumptions

Use remaining tokens before Pi's actual native trigger, not a universal percentage:

```text
N = W - effectiveReserveTokens
B = planned additional-context budget for a bounded work cycle
    (illustrative default: 16,384 tokens; larger for known large batches)

highRunway     = max(B, 0.05 * W)
moderateRunway = 2 * highRunway

moderateAt = max(0, N - moderateRunway)
highAt     = max(0, N - highRunway)
```

Rationale:

- **B:** leave a concrete amount of working room between an invitation and native intervention. This is additional conversation growth, not another reservation of the model's theoretical maximum output. The illustrative 16,384 value is a policy budget, not an empirically established universal cycle size.
- **One versus two runway units:** distinguish approaching the last comfortable opportunity from an earlier chance to finish a phase. These are planning margins, not guaranteed turns.
- **5% floor:** an explicit conservative design allowance for projection/counting uncertainty and scheduling variability that grows with context size. It is not a measured 5% token-estimator error bound. It avoids recommending a first warning only 16k before native compaction on a 1M window. It also matches the scale of the existing post-compaction safety margin without treating that existing heuristic as independent evidence.
- **10% moderate runway:** follows from doubling high runway, rather than adding another unrelated tuning constant.
- **R:** honor actual settings. An unusually large reserve can make the resulting advisory thresholds very early. If N is too small to support the selected margins, the policy needs explicit configuration review rather than pretending the normal percentage table applies.

### Derived capacity thresholds with default R = 16,384 and B = 16,384

| Window | Moderate token count | Moderate percent | High token count | High percent |
|---|---:|---:|---:|---:|
| 128,000 | 78,848 | 61.60% | 95,232 | 74.40% |
| 272,000 | 222,848 | 81.93% | 239,232 | 87.95% |
| 1,000,000 | 883,616 | 88.36% | 933,616 | 93.36% |

For the 272k/22k-reserve case: **217,232 / 233,616 tokens = 79.86% / 85.89%**.
For the 1M/32,768-reserve case: **867,232 / 917,232 tokens = 86.72% / 91.72%**.

For the locally configured 128k cases, the same formula produces **48.8% / 61.6%** with R=32,768 and **24.4% / 37.2%** with R=64,000. Those surprising values follow from their native limits of 74.4% and 50%, not a research finding that these models should discard history that early. I would review those reserve choices and the intended work-cycle budget before adopting those advisory settings.

This is a justified engineering policy, not a mathematically optimal boundary. The supporting research establishes the trade-offs; the formula makes the chosen safety/notification trade-off explicit. We do not need to conduct experiments before adopting a reasoned default.

## 5. Consequences for the current implementation

The working tree still uses 60/75. Its effective high threshold is:

```text
min(configuredHighPercent, nativePercent - 10 percentage points)
```

This means merely changing the CLI high-pressure flag is insufficient to implement the recommendation. For example, with a 1M window and a 16,384 reserve, that override would still escalate at 88.36% even if the flag were 93%. With the operator's 32,768 reserve, it would escalate at 86.72% even with a 92% flag.

The 128k/64k-reserve case currently escalates to high at 40%, skipping the nominal 60% moderate band entirely. The 128k/32,768-reserve case escalates at 64.4%. These are consequences of the current native-proximity branch, not of the displayed 75% default.

If implementing this recommendation later:

1. Replace the fixed native-minus-10-points high branch with the runway calculation, while retaining explicit overrides and reserve awareness.
2. Keep semantic cleanup optional: a finished phase plus obsolete context can justify an earlier offer, but percentage alone should not claim quality degradation. A necessary active corpus is not stale simply because it is large.
3. Continue requiring explicit authorization, a useful net reduction, preserved unresolved work, and a safe execution boundary. Pressure does not make an unsafe summary acceptable.
4. Make high-pressure escalation eligible despite the ordinary two-turn cooldown when necessary. With one runway unit left, blindly waiting two more turns can miss the opportunity. This still must not authorize compaction on silence.
5. Retain a bounded offer budget, reserving the final opportunity for genuine late pressure rather than spending it at 75% on a 1M window. Native compaction remains the fallback after ignored or declined offers.
6. Treat post-compaction headroom separately from offer timing. The current `requiredHeadroom()` also considers `model.maxTokens`; that is an eligibility check, not Pi's native trigger and not an estimate of typical next-turn growth.

No source-code change is included in this research.

## Sources and evidence boundaries

- **[S1] Pi compaction documentation and implementation:** [compaction reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md), [compaction source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/compaction/compaction.ts). For version specificity, the installed Pi 1.2.0 `docs/compaction.md` and `dist/core/compaction/compaction.js` were read directly; upstream `main` can change. The local reference states default R=16,384, per-model overrides, lifecycle checks, and summarizer-budget effects.
- **[S2] Anthropic, Effective context engineering for AI agents:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — performance gradient, high-signal context, compaction and information-loss trade-offs.
- **[S3] Google, Gemini long context:** https://ai.google.dev/gemini-api/docs/long-context — multi-needle limitations, unnecessary context, caching, and latency.
- **[S4] Chroma, Context Rot: How Increasing Input Tokens Impacts LLM Performance:** https://research.trychroma.com/context-rot — original 2025 research across 18 models; not a threshold calibration for current Pi coding sessions.
- **[S5] Anthropic, Compaction at a token threshold:** https://platform.claude.com/docs/en/build-with-claude/compaction-threshold — 150k default, 50k minimum, sampling/billing and cache considerations.
- **[S6] OpenAI, Compaction:** https://developers.openai.com/api/docs/guides/compaction — configurable server-side threshold, 200k example, opaque state, standalone input must still fit.
- **[S7] OpenAI, Prompt caching:** https://developers.openai.com/api/docs/guides/prompt-caching#compaction-can-reduce-cache-reuse — prefix/cache changes and total-cost trade-off.

Web sources were fetched directly through Firecrawl; numeric tables were calculated locally. No model-quality benchmarks or experimental threshold comparisons were run or claimed. Local settings/model metadata were used only for the explicitly labeled configuration examples.

## Implementation follow-up

The operator subsequently approved this recommendation. The working tree now derives pressure bands from `N - 2H` / `N - H`, with `H = max(16384, 5% of window)`, and removes the native-minus-ten-points override. Explicit percentages remain supported, capped at the native boundary with high at least moderate. Moderate-to-high escalation bypasses cooldown but not the offer cap or native opt-out. Earlier optional semantic cleanup continues through the existing intentional milestone tools; no new low-pressure unsolicited offers were added. The earlier sections describe the pre-change policy for comparison. No global settings, installation, or reserve values were changed.
