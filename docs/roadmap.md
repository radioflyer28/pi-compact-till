# Roadmap: prove utility before expanding autonomy

## Purpose and status

This roadmap is for maintainers choosing the next small, verifiable improvement after v0.2.2. It captures proposed work, not a release commitment or authorization to run paid evaluations, change global settings, or publish another release.

**Design intent:** provide deliberate control over which recent context remains verbatim, while summarizing an older contiguous prefix at a safe point. Treat this as working-context management, not a proven cost optimizer.

The strongest established capability is boundary control with structural and lifecycle safeguards. The weakest established claim is that autonomous timing and selection reliably improve total cost or task quality. The next gains should come from evaluating decisions and outcomes, not adding more autonomous modes.

### Starting point

- v0.2.2 delivers advisories in persisted top-level tool results rather than transient context injections. This avoids a reproduced Pi 1.4 system/tool-history folding mechanism that rewrote the leading provider input.
- Installed-copy offline tests cover prefix stability, ignored/deferred/native decisions, superseded offers, failed compaction, and reconstructed context. Lifecycle checks cover successful execution, queued-input cancellation, repair, and scheduling.
- Those checks establish client behavior, not guaranteed provider cache hits or semantic summary completeness. Live behavior of the new advisory transition still needs observation.
- Proactive selection checks estimated net token savings and headroom. Agent scheduling has a pressure gate but does not yet share all those effectiveness checks.
- Summary validation is structural. It cannot establish that a critical constraint or piece of evidence survived.

See [v0.2.2 release notes](release-v0.2.2.md) and the [compaction design](proactive-compaction.md) for current behavior.

## Guardrails for every stage

- Keep one contiguous retained suffix, valid tool-call/result relationships, exact option authorization, and revalidation before execution.
- Keep inspect, defer, native handling, and explicit human control. Silence must not authorize compaction.
- Do not weaken native threshold/overflow recovery. A failed deliberate request must not silently substitute an unapproved cutoff.
- Preserve cache-stable advisory placement and original tool output, including structured content.
- Keep additional diagnostics opt-in, local, bounded, and outside model context. Do not collect prompt text, tool arguments, credentials, headers, or raw provider responses in metrics exports.
- Use synthetic or explicitly approved sanitized fixtures for semantic evaluations. Paid runs require an agreed model, budget, and scope.
- Do not change defaults or advertise economic benefits on the strength of a small anecdotal sample.

## Priority 1 — Measure real usefulness

**Outcome:** a maintainer can explain what a compaction bought, what it cost, and what remains unknown.

Start with a read-only report over existing local session records. Reuse optional cache diagnostics only where request-prefix evidence is needed. Inventory available fields before adding instrumentation; missing measurements must be reported as unknown, never as zero.

For each observed compaction, report:

| Measure | Interpretation and limits |
| --- | --- |
| Trigger, model, runtime, and extension version | Separate proactive, scheduled, manual, and native behavior; record known reload/model/config changes. |
| Context before and first measured context after | Show estimated versus provider-derived values separately; compute native headroom using the applicable reserve. |
| Runway until next compaction | Report elapsed time, assistant requests, and context growth. If the session ends first, report an incomplete observation, not infinite runway. |
| Summary cost | Include failed attempts and repairs where usage is available. Existing main-turn cache diagnostics do not measure nested summary calls; mark missing cost explicitly. |
| Cache behavior | Show uncached/cached input before the advisory, on its response, on the next request, and around actual compaction. Distinguish a prefix mismatch from eviction/routing or unknown causes. |
| Continuation cost and progress | Use a declared observation horizon, ideally a completed task. Include summary cost and cache warming, not just token reduction. |
| Subsequent rework | Start with operator labels: repeated investigation, forgotten constraints, unnecessary rereads, or wrong conclusions. Extra tool calls alone are not proof of rework. |

**Comparison:** compare proactive behavior with native handling on comparable tasks. An uncontrolled live sample is descriptive, not causal. Keep model, settings, task, and scoring fixed in later controlled comparisons; report differences rather than pooling incompatible runs.

**Acceptance criteria**

- [ ] A content-free local report distinguishes observed values, estimates, unavailable fields, and incomplete follow-up.
- [ ] At least one natural post-reload advisory transition is checked for persisted delivery and before/during/after cache usage. No forced context inflation is required.
- [ ] A small pilot includes completed compaction follow-up and native-handling observations; insufficient data is explicitly reported rather than treated as success.
- [ ] Token savings and monetary savings are separately named. No claim of benefit is made solely because the resulting context is shorter.

## Priority 2 — Evaluate semantic continuation

**Outcome:** the project can detect loss of important information even when a summary has all required headings.

Build a small fixture suite with explicit facts and constraints, followed by realistic continuation tasks. Begin with these six cases:

1. An early hard requirement must still constrain the implementation.
2. A previously rejected approach must not be proposed again without new evidence.
3. An exact test result or error detail must be used correctly.
4. Unfinished work must not be described as completed.
5. A split-turn summary must preserve the current request and unresolved investigation.
6. A second compaction must retain a critical fact carried by an earlier summary.

Define the expected outcomes before generating summaries. Compare the original context with the compacted context on the same continuation, and use native compaction as a baseline where applicable. Separate summary omission, poor boundary selection, and pre-existing model failure. Use deterministic checks for exact facts and a written human rubric for semantic judgments. Do not treat a model's self-score as ground truth.

**Acceptance criteria**

- [ ] Fixtures and scoring can be exercised offline using deliberately good and bad summaries.
- [ ] Negative controls fail even when they have syntactically valid summary headings.
- [ ] Each case checks downstream behavior, not merely keyword presence in the summary.
- [ ] Any approved live pilot reports per-case results, repetitions, model/settings, and usage, including baseline failures. It does not imply statistical certainty from a tiny sample.

## Priority 3 — Unify agent-directed effectiveness checks

**Outcome:** the same proposed cutoff receives the same effectiveness judgment whether requested through a proactive offer or the scheduling tool.

Reuse one policy for pressure eligibility, minimum estimated savings, and required headroom. Evaluate it at authorization and again before execution, because context, settings, model capacity, and the selected boundary can change. Return a clear decline reason when the proposal is no longer effective. Do not introduce another public tool or configuration mode.

Keep explicit human requests as an intentional override. Preserve the distinct semantics of legacy threshold preferences and Pi's mandatory native recovery rather than accidentally gating those on an agent-only policy.

**Acceptance criteria**

- [ ] Given the same context, capacity, settings, and cutoff, proactive and scheduled requests agree on effectiveness.
- [ ] Tests cover adequate and inadequate savings, inadequate headroom, below-moderate pressure, missing capacity, stale boundaries, changed model/reserve, queued input, and execution-time revalidation.
- [ ] Explicit human compaction and native recovery retain their documented behavior.
- [ ] Real-runtime checks confirm safe execution ordering and cache-stable advisory delivery after the refactor.

## Priority 4 — Keep the interface small

This is an ongoing constraint, not a separate feature release.

Do not add more autonomous modes, semantic background classifiers, scattered-message pinning, or additional pressure knobs until measurements expose a concrete need. Prefer a deeper shared policy behind the existing tools over more tools and duplicated rules.

Revisit defer/cooldown behavior only if observations show repeated interruptions or premature reoffers. Assistant-message counts are not equivalent to meaningful task progress. Evaluate durable checkpoint notes as a complement to summarization if retention tests reveal important older facts being lost; do not assume more elaborate history rewriting is the answer.

**Decision gate:** any new interface element must name the observed problem, the simpler alternative considered, and the measurable outcome that justifies it.

## Best short-term sequence

The work has three tracks, not a dependency chain. The agreed immediate scope is shared runtime safeguards plus a small semantic evaluation suite; reporting follows the questions those evaluations expose.

1. **Evaluation track:** write the six continuation fixtures and scoring rubric, validate authored positive/negative controls offline, then propose a budgeted comparison using generated summaries and continuations. Fixed cutoffs isolate summary retention; automatic cutoff selection is a separate later experiment.
2. **Correctness track:** implement shared savings/headroom checks with authorization, execution, and generated-summary revalidation. Preserve human/native exceptions. This directly changes runtime behavior; it does not prove the policy is economically optimal.
3. **Observation track:** inspect existing metadata and observe natural advisories while normal work proceeds. Build the smallest read-only usefulness report around the actual failure categories. Do not force compaction or wait for this track before doing the other two.
4. **Combine the evidence:** fix demonstrated failures and rerun comparisons before changing defaults or adding modes. If no semantic failure is demonstrated, call the result increased confidence, not improved model quality.

### Current implementation evidence (unreleased)

- Shared agent effectiveness checks and regression tests now cover scheduled/proactive authorization, execution-time changes, generated-summary size, and reserve changes during generation. Existing human/native paths remain separate.
- Six synthetic structured-decision probes and paired-result scoring are available; see the [evaluation guide](semantic-evaluation.md). Authored controls are not model-generated results.
- Paid end-to-end semantic evaluation, policy-quality claims, and the usefulness report remain outstanding. No global installation or release update is implied.

## Open questions before broader rollout

- Which models, Pi versions, and task families should define the initial comparison set?
- What live-evaluation budget and repetition count are acceptable?
- Which summary-usage fields are consistently available across supported runtimes, and what minimal instrumentation is actually missing?
- What retention failures are release-blocking, and what trade-off between runway and rework is acceptable?
- Which benefits recur often enough to justify changing a default rather than offering explicit control?

These questions do not block read-only observation, offline fixtures, or policy-parity tests. They do block broad claims that autonomous compaction improves cost or task quality.
