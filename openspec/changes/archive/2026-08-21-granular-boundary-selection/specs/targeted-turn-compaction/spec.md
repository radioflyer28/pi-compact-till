## ADDED Requirements

### Requirement: Reveal safe agent checkpoints
The `/compact-until` picker SHALL initially show its existing completed-user-exchange view. The picker SHALL provide a documented in-picker hotkey that switches to, and can switch back from, an advanced view containing eligible assistant-message checkpoints in addition to the completed user exchanges.

Each advanced checkpoint SHALL identify whether it is a user exchange or agent message and SHALL provide a readable preview. An agent checkpoint SHALL be selectable only when it can be used as the first retained message without leaving a tool result separated from the assistant tool call it answers. Tool-result entries SHALL NOT be presented as selectable boundaries.

#### Scenario: User reveals agent checkpoints
- **WHEN** the user invokes the documented hotkey while the `/compact-until` picker is open
- **THEN** the picker SHALL show eligible assistant-message checkpoints alongside the default user-exchange choices

#### Scenario: User returns to the default view
- **WHEN** the user invokes the documented hotkey while the advanced picker view is open
- **THEN** the picker SHALL return to showing only completed user exchanges

#### Scenario: An agent message has linked tool activity
- **WHEN** an eligible assistant message includes tool calls
- **THEN** selecting that checkpoint SHALL retain that assistant message and its subsequent linked tool results together

#### Scenario: A tool result is encountered
- **WHEN** the uncompacted context contains a tool-result entry
- **THEN** the picker SHALL NOT offer that entry as a compaction boundary

### Requirement: Compact before the selected safe boundary
When a user selects either a user exchange or an agent checkpoint, the command SHALL confirm that selection as the first context entry retained verbatim. The generated checkpoint SHALL summarize the available uncompacted context preceding the selected boundary, including the earlier portion of the same user turn when the selected boundary is an agent message.

#### Scenario: User selects an agent checkpoint within a long request
- **WHEN** the user confirms an eligible assistant-message checkpoint after a user prompt
- **THEN** the context beginning with that assistant message SHALL remain verbatim and the preceding portion of that user request SHALL be compacted

#### Scenario: User declines an advanced-boundary confirmation
- **WHEN** the user selects an agent checkpoint but declines confirmation
- **THEN** the session and active context SHALL remain unchanged
