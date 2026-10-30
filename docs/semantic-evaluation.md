# Semantic continuation evaluation

## What this suite establishes

This development suite tests whether a continuation chooses the required next action or reproduces exact evidence after a fixed history prefix is summarized. It is not a runtime summary validator, an automatic cutoff-selection benchmark, or a substitute for real coding tasks.

Six synthetic cases cover an early confidentiality requirement, a rejected retry strategy, exact regression evidence, unfinished verification, a split-turn investigation-only request, and a constraint carried through an earlier summary. Each has a retained suffix, a structured continuation task, an expected decision, and authored correct/incorrect summaries and decisions.

Both correct and incorrect summaries satisfy the package's structural heading checks. Incorrect controls sometimes contain the right technical terms but reverse their meaning. Scoring checks the requested decision fields and operation order, not whether the summary mentions a keyword. These bounded probes do not execute model-generated code or tools.

**Evidence status:** offline tests validate the fixtures, structural-validation blind spot, scorer, abstention handling, and paired-run bookkeeping. No model-generated semantic results have been collected in this change. The authored incorrect summaries are deliberate controls, not observed failures of Pi's summarizer. No summarizer-prompt change is justified by those controls alone.

## Offline commands

Run from a development checkout with Node 22.18+ or 24+:

```bash
npm run eval:controls
node scripts/eval-continuation.mjs sources
node scripts/eval-continuation.mjs prompts original
node scripts/eval-continuation.mjs prompts good
node scripts/eval-continuation.mjs prompts bad
```

`controls` scores authored decisions and labels them `fixture-control`, with zero model calls. It does not infer a continuation from a summary. The other commands emit synthetic sources or provider-neutral messages; none sends a request or reads credentials. Prompt exports exclude answer keys and scoring expectations. Do not give a model the complete fixture source file, which includes those keys.

## Running an actual experiment

Agree on provider/model, reasoning settings, repetition count, and spending cap before making paid requests. Keep continuation settings identical across original and compacted arms. The six cases are development fixtures, not a held-out representative sample; a passing run does not establish production accuracy.

1. Export `sources`. Each case specifies a prefix to summarize, a retained suffix, and whether it is a split turn. For the repeated-compaction case, the prefix intentionally contains an earlier summary; it does not simulate an entire historical session by itself.
2. Generate candidate summaries through the Pi/package summarization path being evaluated, respecting split-turn semantics. Record the exact extension commit, Pi version, summary generation settings, preservation instructions, and failures. Do not pass the future probe or answer key to the summarizer. Using a generic independent summarizer measures that summarizer, not the extension pipeline.
3. Save the resulting summaries as a JSON object mapping every case ID to its summary string. Prepare candidate continuation inputs:

   ```bash
   node scripts/eval-continuation.mjs prompts candidate summaries.json
   ```

4. Submit original-context and candidate-summary prompts as independent requests, without sharing conversation state between arms. Run the same planned repetitions for every case. Optionally run the good/bad summary controls to check the continuation model's sensitivity. Do not silently regenerate failed summaries or discard inconvenient trials.
5. Parse each response as the requested JSON object. Record malformed responses and provider errors separately. Save all paired results with the format below and score them:

   ```bash
   node scripts/eval-continuation.mjs score results.json
   ```

The command exits 0 only when every original and candidate decision passes, 1 for a complete run containing non-passing outcomes, and 2 for malformed/incomplete run data or CLI input. Keep raw responses and summaries locally only as needed; use synthetic or explicitly approved sanitized inputs. The scoring report includes public provenance, statuses, and failing field names, not raw response text.

## Paired result format

```json
{
  "suiteVersion": 1,
  "run": {
    "kind": "model",
    "provider": "provider-id",
    "model": "model-id",
    "settings": "public continuation settings or immutable config ID",
    "runtime": "Pi version",
    "extensionCommit": "commit ID",
    "summarySource": "local artifact ID including summarizer settings and preservation instructions"
  },
  "results": [
    {
      "id": "early-constraint",
      "trial": 1,
      "condition": "original",
      "output": { "storage": "memory", "telemetry": false }
    },
    {
      "id": "early-constraint",
      "trial": 1,
      "condition": "candidate",
      "output": { "action": "ask-for-context" }
    }
  ]
}
```

This is a schema example, not a complete run. Include both conditions for **all six cases in every trial**. Use `error: "timeout"` (or another bounded category) when the request failed; do not put credentials or raw provider responses in errors or metadata. Use `run.kind: "fixture-control"` for authored decisions. Keep native-compaction comparisons in separately labeled runs with the same baseline conditions.

## Rubric and interpretation

- **Pass:** all requested action/evidence fields match the independently specified fixture contract, without extra fields. Arrays encode an exact operation order.
- **Fail:** a well-shaped decision violates at least one contract field. Correct words in unrelated prose do not compensate.
- **Abstain:** the sole output is `{"action":"ask-for-context"}`. This is safer than guessing but is not successful information retention.
- **Invalid output:** wrong shape, missing/extra fields, or invalid value types. This is an operational/interface failure, not proof of factual forgetting.
- **Provider error:** a request failed; do not treat it as a semantic judgment.

Paired reports call a case a semantic **regression** only when the original-context arm passed and the candidate arm produced an incorrect decision. Baseline failures, abstentions, and operational failures are reported separately. Any non-pass blocks a claim that all probes succeeded; manual review determines cause and release implications.

Inspect the generated summary and the retained suffix to distinguish an omitted fact from a continuation-model error. A fixed-cutoff experiment does not establish that the agent chose an appropriate cutoff. Test selection separately once summary/continuation failures can be isolated. Freeze these development cases after initial fixes and add independently reviewed held-out tasks before claiming a general improvement.

## Relationship to shared safeguards

The shared agent policy is a direct runtime change: scheduled and proactive compaction require moderate pressure, useful estimated savings, and adequate headroom, then recheck actual summary size and current capacity. Scheduling also checks the reserve from native preparation, conservatively retaining the larger of that reserve and current persisted settings. Explicit human compaction and native threshold/overflow behavior are not gated by these agent-only checks.

Those safeguards address capacity and lifecycle reliability. They do not assess whether a summary is factually adequate. This suite provides evidence for future quality fixes without adding another runtime model, tool, or autonomous mode.
