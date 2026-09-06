## MODIFIED Requirements

### Requirement: Preserve normal Pi compaction behavior
The extension SHALL apply its selected boundary only to a compaction explicitly started by `/compact-until` or by a successfully scheduled agent-directed request. Native manual compaction, automatic threshold compaction, and overflow recovery SHALL retain Pi's normal behavior when neither a user-directed nor agent-directed targeted compaction is pending.

#### Scenario: Native compaction runs without a pending selection
- **WHEN** Pi runs `/compact`, automatic compaction, or overflow recovery without `/compact-until` or an agent-directed request having initiated a targeted compaction
- **THEN** the extension SHALL not alter Pi's selected cut point or compaction result
