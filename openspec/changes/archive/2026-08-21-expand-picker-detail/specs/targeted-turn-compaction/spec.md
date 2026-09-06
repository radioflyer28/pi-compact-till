## ADDED Requirements

### Requirement: Inspect the highlighted boundary message
The interactive `/compact-until` boundary picker SHALL document an in-picker detail hotkey. When the user invokes that hotkey, the picker SHALL reveal an expanded, read-only representation of the boundary currently highlighted in the picker without selecting it, starting compaction, or changing the picker view.

For a user-exchange boundary, the detail SHALL represent the completed user prompt identified by that picker row. For an agent-checkpoint boundary, it SHALL represent the assistant message identified by that row. The detail SHALL identify the boundary kind and include the available human-readable message content beyond the compact picker preview; when the assistant message contains tool calls, their names SHALL remain identifiable. Tool-result entries SHALL NOT be displayed as selectable boundaries or as independently inspectable detail targets.

#### Scenario: User inspects a highlighted user exchange
- **WHEN** the user invokes the documented detail hotkey while a user-exchange row is highlighted
- **THEN** the picker SHALL show expanded detail for that completed user prompt and keep the row unselected

#### Scenario: User inspects a highlighted agent checkpoint
- **WHEN** the user invokes the documented detail hotkey while an agent-checkpoint row is highlighted in the advanced view
- **THEN** the picker SHALL show expanded detail for that assistant message, including any associated tool-call names, and keep the row unselected

#### Scenario: User resumes selection after inspecting detail
- **WHEN** the user dismisses or moves past the detail view
- **THEN** the picker SHALL remain available in its prior view and no compaction SHALL have started unless the user separately selects and confirms a boundary
