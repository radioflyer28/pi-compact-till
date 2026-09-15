## MODIFIED Requirements

### Requirement: Repair one invalid generation safely
When the first generated summary fails validation, the extension SHALL make exactly one corrective generation attempt from the same compaction input. The corrective instructions SHALL preserve the package rubric and original caller focus and SHALL identify the structural failures that must be repaired.

If the corrective attempt is valid, the extension SHALL use it for the checkpoint and SHALL account for model usage from both generation attempts. If the corrective attempt remains invalid for a user-started or agent-scheduled targeted compaction, the extension SHALL cancel targeted compaction, notify the user, and leave the existing context unchanged. If the corrective attempt remains invalid for advisory-selected automatic threshold compaction, the extension SHALL abandon the advisory-selected result and allow Pi's native threshold compaction to proceed.

#### Scenario: Corrective generation succeeds
- **WHEN** the first summary is invalid and the single corrective attempt produces a valid summary
- **THEN** the extension SHALL create the checkpoint from the corrected summary and record the combined usage of both attempts

#### Scenario: Corrective generation remains invalid
- **WHEN** both the initial and corrective summaries fail for a user-started or agent-scheduled targeted compaction
- **THEN** the extension SHALL cancel targeted compaction, notify the user of the validation failure, and SHALL NOT replace earlier context

#### Scenario: Corrective generation remains invalid for advisory-selected threshold compaction
- **WHEN** both the initial and corrective summaries fail for advisory-selected automatic threshold compaction
- **THEN** the extension SHALL discard the targeted result and allow Pi's native threshold compaction to proceed

#### Scenario: Underlying compaction throws an error
- **WHEN** the underlying compactor fails for a user-started or agent-scheduled targeted compaction instead of returning a summary
- **THEN** the extension SHALL retain its existing failure behavior and SHALL NOT add a package-level retry beyond the underlying compactor's own retry handling

#### Scenario: Underlying compaction throws during advisory-selected threshold compaction
- **WHEN** the underlying compactor fails for advisory-selected automatic threshold compaction instead of returning a summary
- **THEN** the extension SHALL allow Pi's native threshold compaction to proceed without an additional package-level retry

### Requirement: Preserve targeted compaction compatibility
Validated summary generation SHALL preserve the selected first-retained boundary, retained context, previous-summary input, file-operation metadata, targeted-compaction provenance, active model and credentials, configured token budget, and cancellation signal supplied by the existing targeted compaction flow.

Advisory-selected automatic threshold compaction SHALL use the same continuation rubric and validation contract as other targeted compaction and SHALL additionally preserve threshold-advisory provenance. Native manual compaction, automatic threshold compaction without a valid advisory-selected preference, and overflow recovery SHALL remain unchanged.

#### Scenario: Validated targeted compaction completes
- **WHEN** an initial or corrected summary passes validation
- **THEN** the resulting checkpoint SHALL retain the selected boundary and applicable targeted-compaction metadata without changing later context

#### Scenario: Validated advisory-selected threshold compaction completes
- **WHEN** an advisory-selected threshold summary passes validation
- **THEN** the resulting checkpoint SHALL retain the selected boundary, threshold-advisory provenance, and later context

#### Scenario: Native Pi compaction occurs
- **WHEN** Pi compacts without an applicable user-started, agent-scheduled, or valid advisory-selected targeted request
- **THEN** the package SHALL NOT apply its rubric, validation, or corrective retry
