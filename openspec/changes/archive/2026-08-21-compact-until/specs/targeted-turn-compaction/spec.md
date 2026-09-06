## Purpose

Allow Pi users to compact completed conversation work at a deliberate turn boundary while retaining newer working context verbatim.

## ADDED Requirements

### Requirement: Select a completed user exchange
The extension SHALL expose a `/compact-until [summary focus]` command that interactively lists selectable completed user exchanges from the active branch's uncompacted context. A selectable exchange SHALL have a later user-turn boundary to serve as the first retained entry. Each selectable item SHALL identify the user turn with a readable preview.

#### Scenario: User chooses a completed turn
- **WHEN** the user runs `/compact-until` and selects a listed completed user turn
- **THEN** the extension SHALL ask the user to confirm the inclusive compaction boundary before changing the session

#### Scenario: User cancels selection or confirmation
- **WHEN** the user dismisses the turn picker or declines confirmation
- **THEN** the extension SHALL leave the session and active context unchanged

#### Scenario: No eligible turn exists
- **WHEN** the active branch has no completed user exchange that remains verbatim
- **THEN** the extension SHALL notify the user and SHALL not start compaction

### Requirement: Compact through the selected exchange
The selected user exchange SHALL include the selected user prompt, all corresponding assistant messages, and linked tool-call and tool-result activity through the next user-turn boundary. The resulting compaction checkpoint SHALL summarize the available uncompacted context through that complete exchange.

#### Scenario: Selected exchange contains tool activity
- **WHEN** the selected user exchange includes assistant tool calls and their results
- **THEN** the generated summary SHALL include that activity and the retained context SHALL begin only after the complete exchange

#### Scenario: Later turns are retained
- **WHEN** a selected exchange is compacted and later user turns exist
- **THEN** every entry after the selected exchange SHALL remain in the new checkpoint's retained context without content or ordering changes

### Requirement: Preserve normal Pi compaction behavior
The extension SHALL apply its selected boundary only to the compaction explicitly started by `/compact-until`. Native manual compaction, automatic threshold compaction, and overflow recovery SHALL retain Pi's normal behavior when no targeted compaction is pending.

#### Scenario: Native compaction runs without a pending selection
- **WHEN** Pi runs `/compact`, automatic compaction, or overflow recovery without `/compact-until` having initiated a compaction
- **THEN** the extension SHALL not alter Pi's selected cut point or compaction result

### Requirement: Pass optional summary focus
The command SHALL accept optional trailing text as summary focus for the requested targeted compaction.

#### Scenario: User supplies summary focus
- **WHEN** the user runs `/compact-until` with trailing text
- **THEN** the generated compaction summary SHALL incorporate that text as additional focus
