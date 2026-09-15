## MODIFIED Requirements

### Requirement: Preserve normal Pi compaction behavior
The extension SHALL apply a selected boundary only to a compaction explicitly started by `/compact-until`, by a successfully scheduled agent-directed request, or by automatic threshold compaction with a valid advisory-selected preference. Native manual compaction and overflow recovery SHALL retain Pi's normal behavior when no explicitly applicable targeted request is triggering.

Automatic threshold compaction SHALL retain Pi's normal behavior when no valid advisory-selected preference exists or when applying that preference cannot safely and effectively complete. Advisory-selected threshold compaction SHALL preserve Pi's native trigger timing while changing only the first-retained boundary and the targeted summary behavior required by the package.

#### Scenario: Native compaction runs without a pending selection
- **WHEN** Pi runs `/compact`, automatic threshold compaction, or overflow recovery without an explicitly applicable user, agent-scheduled, or advisory-selected targeted request
- **THEN** the extension SHALL not alter Pi's selected cut point or compaction result

#### Scenario: Threshold compaction has a valid advisory selection
- **WHEN** Pi starts automatic threshold compaction with a valid and effective advisory-selected preference
- **THEN** the extension SHALL apply the selected safe boundary while preserving Pi's threshold trigger lifecycle

#### Scenario: Advisory selection cannot be applied
- **WHEN** Pi starts automatic threshold compaction and the advisory-selected preference is absent, stale, unsafe, ineffective, or fails during targeted processing
- **THEN** the extension SHALL allow Pi's native threshold compaction to proceed
