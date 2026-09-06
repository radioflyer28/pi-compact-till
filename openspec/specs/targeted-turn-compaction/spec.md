# targeted-turn-compaction Specification

## Purpose

Allow Pi users to compact completed conversation work at a deliberate turn boundary while retaining newer working context verbatim.

## Requirements

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

### Requirement: Preserve normal Pi compaction behavior
The extension SHALL apply its selected boundary only to a compaction explicitly started by `/compact-until` or by a successfully scheduled agent-directed request. Native manual compaction, automatic threshold compaction, and overflow recovery SHALL retain Pi's normal behavior when neither a user-directed nor agent-directed targeted compaction is pending.

#### Scenario: Native compaction runs without a pending selection
- **WHEN** Pi runs `/compact`, automatic compaction, or overflow recovery without `/compact-until` or an agent-directed request having initiated a targeted compaction
- **THEN** the extension SHALL not alter Pi's selected cut point or compaction result

### Requirement: Pass optional summary focus
The command SHALL accept optional trailing text as summary focus for the requested targeted compaction.

#### Scenario: User supplies summary focus
- **WHEN** the user runs `/compact-until` with trailing text
- **THEN** the generated compaction summary SHALL incorporate that text as additional focus

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
- **THEN** the picker SHALL show expanded detail for that assistant message, including any associated tool-call names, and keep the row unselected

#### Scenario: User resumes selection after inspecting detail
- **WHEN** the user dismisses or moves past the detail view
- **THEN** the picker SHALL remain available in its prior view and no compaction SHALL have started unless the user separately selects and confirms a boundary

### Requirement: Navigate all eligible boundary choices
The interactive `/compact-until` picker SHALL initially display the five most recent eligible safe boundaries in its active view, or every eligible boundary when fewer than five exist. It SHALL make every older eligible boundary in that view available by scrolling upward and SHALL NOT limit the selectable set to those initial five rows.

When the active view has more choices than can be displayed at once, the picker SHALL let the user navigate to off-screen choices and keep the highlighted choice visible as navigation moves through the list. Selecting an older choice SHALL retain the existing boundary-detail and confirmation behavior for that exact choice.

#### Scenario: Picker opens at the most recent boundaries
- **WHEN** the default picker view contains more than five eligible user-message boundaries
- **THEN** the picker SHALL initially display the five most recent boundaries

#### Scenario: User navigates past the initial visible choices
- **WHEN** the default picker view contains more than five eligible user-message boundaries and the user scrolls upward to an older off-screen boundary
- **THEN** the picker SHALL reveal and highlight that boundary so the user can select and confirm it

#### Scenario: User selects an older boundary
- **WHEN** the user confirms an older boundary reached by picker navigation
- **THEN** the extension SHALL compact using that selected boundary as the first retained message

#### Scenario: User views many agent checkpoints
- **WHEN** the advanced picker view contains more eligible boundaries than fit in its visible area
- **THEN** the user SHALL be able to navigate to and select any eligible user-message or agent-checkpoint boundary in that view
