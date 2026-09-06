## MODIFIED Requirements

### Requirement: Select a completed user exchange
The extension SHALL expose a `/compact-until [summary focus]` command that interactively lists selectable first-retained-message boundaries from the active branch's uncompacted context. Each selectable item SHALL identify the message that will remain verbatim with a readable preview. A user-message boundary SHALL be offered only when it follows a completed user exchange that can be summarized safely.

#### Scenario: User chooses a completed turn
- **WHEN** the user runs `/compact-until` and selects a listed user-message boundary
- **THEN** the extension SHALL ask the user to confirm that the selected user message is the first retained message before changing the session

#### Scenario: User cancels selection or confirmation
- **WHEN** the user dismisses the boundary picker or declines confirmation
- **THEN** the extension SHALL leave the session and active context unchanged

#### Scenario: No eligible turn exists
- **WHEN** the active branch has no safe first-retained-message boundary that remains verbatim
- **THEN** the extension SHALL notify the user and SHALL not start compaction

### Requirement: Compact through the selected exchange
Every selected boundary SHALL be exclusive: the selected message and every later entry SHALL remain in the new checkpoint's retained context without content or ordering changes, while the available uncompacted context preceding it SHALL be summarized.

For a user-message boundary, the summarized preceding context SHALL include the immediately preceding completed user exchange, including its user prompt, assistant messages, and linked tool-call and tool-result activity.

#### Scenario: Selected exchange contains tool activity
- **WHEN** the completed exchange preceding a selected user-message boundary includes assistant tool calls and their results
- **THEN** the generated summary SHALL include that activity and retained context SHALL begin with the selected user message

#### Scenario: Later turns are retained
- **WHEN** the user confirms any safe boundary
- **THEN** the selected message and every entry after it SHALL remain verbatim in the new checkpoint

### Requirement: Compact before the selected safe boundary
When a user selects either a user-message boundary or an agent checkpoint, the command SHALL present that selected item as the first context entry retained verbatim. The generated checkpoint SHALL summarize the available uncompacted context preceding the selected boundary, including the earlier portion of the same user turn when the selected boundary is an agent message.

#### Scenario: User selects the boundary after a completed exchange
- **WHEN** the user confirms a user-message boundary
- **THEN** the selected user message SHALL remain verbatim and the preceding completed exchange SHALL be compacted

#### Scenario: User selects an agent checkpoint within a long request
- **WHEN** the user confirms an eligible assistant-message checkpoint after a user prompt
- **THEN** the context beginning with that assistant message SHALL remain verbatim and the preceding portion of that user request SHALL be compacted

#### Scenario: User declines an advanced-boundary confirmation
- **WHEN** the user selects an agent checkpoint but declines confirmation
- **THEN** the session and active context SHALL remain unchanged

### Requirement: Inspect the highlighted boundary message
The interactive `/compact-until` boundary picker SHALL document an in-picker detail hotkey. When the user invokes that hotkey, the picker SHALL reveal an expanded, read-only representation of the boundary currently highlighted in the picker without selecting it, starting compaction, or changing the picker view.

For a user-message boundary, the detail SHALL represent the user message that will be retained. For an agent-checkpoint boundary, it SHALL represent the assistant message that will be retained. The detail SHALL identify the boundary kind and include the available human-readable message content beyond the compact picker preview; when the assistant message contains tool calls, their names SHALL remain identifiable. Tool-result entries SHALL NOT be displayed as selectable boundaries or as independently inspectable detail targets.

#### Scenario: User inspects a highlighted user exchange
- **WHEN** the user invokes the documented detail hotkey while a user-message boundary row is highlighted
- **THEN** the picker SHALL show expanded detail for that retained user message and keep the row unselected

#### Scenario: User inspects a highlighted agent checkpoint
- **WHEN** the user invokes the documented detail hotkey while an agent-checkpoint row is highlighted in the advanced view
- **THEN** the picker SHALL show expanded detail for that retained assistant message, including any associated tool-call names, and keep the row unselected

#### Scenario: User resumes selection after inspecting detail
- **WHEN** the user dismisses or moves past the detail view
- **THEN** the picker SHALL remain available in its prior view and no compaction SHALL have started unless the user separately selects and confirms a boundary
