## Context

The proposed granular-boundary-selection change supplies a shared model of Pi-safe user and assistant-message boundaries, including split-turn preparation. This change builds on that model so an agent can choose the same boundaries that a human can reveal in the picker.

Pi's `ctx.compact()` starts manual compaction by aborting the active agent operation. A model-callable tool therefore cannot safely invoke it inline: the tool must record an intent, allow the current run to finish, then trigger compaction from the settled lifecycle state.

## Goals / Non-Goals

**Goals:**

- Give the model enough structured boundary information to intentionally choose a checkpoint.
- Make compaction an explicit agent decision, suitable after meaningful transitions such as completed tests or an archived change.
- Avoid interrupting the current tool call or agent run.
- Keep normal Pi compaction independent from an agent-scheduled request.
- Make autonomous compaction visible and inspectable to the human user.

**Non-Goals:**

- Automatically infer semantic transitions or compact without a model tool call.
- Ask the user for confirmation after an agent explicitly schedules compaction.
- Allow the model to select arbitrary raw session entries, including tool results.
- Run more than one agent-directed compaction concurrently or persist a scheduled request across a session shutdown.

## Decisions

### Provide explicit discovery and scheduling tools

Register two model-callable tools:

- `list_compaction_boundaries` returns the current shared safe-boundary candidates with their `firstKeptEntryId`, kind, and concise preview.
- `schedule_compaction` accepts one returned ID and optional `summaryFocus`, validates it immediately, and reports either a scheduled request or a precise rejection.

The tool descriptions will instruct the model to use discovery before scheduling and to schedule only at a deliberate transition. IDs are necessary because the model's conversational view does not expose stable session-entry identifiers. A single tool that guesses a boundary from natural-language text was rejected because it would make the compacted/retained split ambiguous and difficult to validate.

No interactive confirmation is requested: the agent has explicitly called the scheduling tool and the human receives lifecycle notification. This retains the value of self-directed context management while preserving observability.

### Defer execution until the current agent run settles

Store a single session-scoped pending request with the session ID, selected first-retained ID, optional summary focus, and a lifecycle state:

```text
scheduled → triggering → completed | cancelled | failed
```

`schedule_compaction` creates a `scheduled` request but does not call `ctx.compact()`. On the matching `agent_settled` event, the extension first checks for queued user input and reconstructs the candidate from the current context. Only then does it set the state to `triggering` and call `ctx.compact()`.

The `session_before_compact` handler will honor a pending boundary only while it is `triggering`; it clears the request before building the targeted compaction input. This preserves a user's independently invoked `/compact` if it occurs before the deferred request is triggered, and prevents automatic/overflow compaction from consuming agent state.

The alternative—calling compaction inside the tool implementation—would abort the run that asked for it. The alternative of forcing the model to end its response and asking the user to re-run a command adds the manual coordination this capability is intended to remove.

### Reuse shared safe candidates and split-turn preparation

The change depends on `granular-boundary-selection` being applied first. It will consume its generalized candidate reconstruction and targeted preparation rather than maintaining a second definition of safe boundaries. This ensures that assistant candidates retain their tool-call/result sequence and that prefix context is summarized with Pi's split-turn mechanism.

The scheduling tool validates the ID both when requested and immediately before execution. Any mismatch, missing model credentials, changed session, pending user input, or compaction error clears the pending request and produces a user-visible status rather than falling back to a different boundary.

### Record provenance and communicate lifecycle

Successful compaction details will include an `agentDirected` marker and the first-retained boundary ID, alongside existing targeted-compaction metadata. The extension will send concise notifications for scheduled, complete, cancelled, and failed states. The scheduling tool itself returns only a scheduled/rejected result, since compaction can occur after the tool call has returned.

This makes automatic behavior auditable without adding telemetry or retaining content outside Pi's normal session log.

## Risks / Trade-offs

- [The agent schedules too aggressively] → Tool guidance limits use to deliberate transitions; the capability is explicit rather than automatic, and user notifications expose each use.
- [The agent continues working after scheduling] → Execution waits for `agent_settled`, then revalidates the original boundary against the complete current context.
- [A user starts manual compaction during the deferral window] → Only the `triggering` lifecycle state customizes `session_before_compact`, so the user's compaction remains native.
- [The prerequisite granular-boundary change is not applied] → Treat its shared boundary model as a hard implementation dependency and document apply order in tasks and README.
- [The tool result itself expands context] → Discovery responses stay concise and scheduling returns a small acknowledgement; the selected boundary still controls which older context is summarized.

## Migration Plan

1. Apply `granular-boundary-selection` first to establish safe user and assistant boundary candidates.
2. Add the model tools and deferred lifecycle to the existing extension.
3. Extend targeted-compaction details and documentation, then verify both manual and agent-directed paths.
4. Roll back by removing the new tool registrations and deferred state; existing session compaction entries remain readable and Pi's native compaction continues unchanged.
