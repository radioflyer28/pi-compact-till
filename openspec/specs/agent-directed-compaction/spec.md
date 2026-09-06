# agent-directed-compaction Specification

## Purpose

Allow a Pi agent to deliberately reduce obsolete context at a safe checkpoint after it completes a meaningful unit of work, without interrupting its current run.

## Requirements

### Requirement: Discover safe compaction boundaries
The extension SHALL expose a model-callable discovery tool that returns the currently eligible safe retained-boundary candidates from the active session. Each returned candidate SHALL include a stable boundary identifier, its user-exchange or agent-checkpoint kind, and a readable preview sufficient for the agent to choose a boundary.

The discovery tool SHALL exclude tool-result entries and candidates that cannot be used to produce a valid targeted compaction checkpoint.

#### Scenario: Agent requests candidate boundaries
- **WHEN** the agent calls the boundary-discovery tool while eligible uncompacted context exists
- **THEN** the tool SHALL return the eligible safe boundaries from the active session

#### Scenario: No safe candidate exists
- **WHEN** the agent calls the boundary-discovery tool and no eligible boundary exists
- **THEN** the tool SHALL report that no compaction can be scheduled and SHALL not change the session

### Requirement: Schedule agent-directed compaction
The extension SHALL expose a model-callable scheduling tool that accepts a boundary identifier returned by the discovery tool and optional summary focus. A valid request SHALL schedule one targeted compaction without an interactive user confirmation.

The tool SHALL acknowledge that the request is scheduled and SHALL NOT compact while the invoking agent run is active. The extension SHALL execute the scheduled compaction only after that run has settled, using the selected boundary as the first entry retained verbatim.

#### Scenario: Agent schedules compaction at a completed checkpoint
- **WHEN** the agent supplies a currently eligible boundary identifier to the scheduling tool
- **THEN** the tool SHALL acknowledge the scheduled compaction and the extension SHALL compact the preceding context after the agent run settles

#### Scenario: Agent supplies summary focus
- **WHEN** the agent includes summary focus in a valid scheduling request
- **THEN** the resulting compaction summary SHALL incorporate that focus

#### Scenario: Agent supplies an invalid or stale identifier
- **WHEN** the agent supplies a boundary identifier that is not currently eligible
- **THEN** the tool SHALL reject the request, explain that the boundary is unavailable, and SHALL not schedule compaction

#### Scenario: Another request is already scheduled
- **WHEN** the agent requests compaction while an earlier agent-directed compaction is still scheduled or executing
- **THEN** the tool SHALL reject the later request and SHALL leave the earlier request unchanged

### Requirement: Safely execute a deferred request
Before executing a scheduled agent-directed compaction, the extension SHALL reconstruct and validate the selected boundary against the current active session. It SHALL cancel the request without changing context if the boundary is no longer valid, the session has changed, or a pending user message would make execution unsafe.

The extension SHALL notify the user when an agent-directed compaction completes, is cancelled, or fails. A successful checkpoint SHALL record that it was agent-directed and the selected retained boundary for session inspection.

#### Scenario: Session changes before the agent settles
- **WHEN** a scheduled boundary is no longer valid when the agent run settles
- **THEN** the extension SHALL cancel the request and notify the user without compacting

#### Scenario: Deferred compaction succeeds
- **WHEN** the agent run settles and the scheduled boundary remains valid
- **THEN** the extension SHALL create the targeted checkpoint and notify the user that agent-directed compaction completed
