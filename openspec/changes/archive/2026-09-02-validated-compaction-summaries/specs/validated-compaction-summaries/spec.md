## Purpose

Ensure every user- or agent-directed targeted compaction produces a structurally complete coding handoff before older context is replaced.

## ADDED Requirements

### Requirement: Produce a coding continuation checkpoint
Every targeted compaction summary SHALL be generated with a package-defined continuation rubric that supplements the underlying compaction instructions. The rubric SHALL prioritize the current goal and acceptance criteria, user constraints and approvals, completed and current work, blockers, decisions and rationale, exact technical identifiers and verification outcomes, the immediate next action, and context needed to understand the retained messages.

Optional focus supplied by a user or agent SHALL be included as supplemental focus and SHALL NOT replace the package-defined continuation requirements.

#### Scenario: User supplies summary focus
- **WHEN** a user starts `/compact-until` with summary focus
- **THEN** the generated checkpoint SHALL apply both the package continuation rubric and the user's supplemental focus

#### Scenario: Agent supplies summary focus
- **WHEN** an agent schedules targeted compaction with summary focus
- **THEN** the generated checkpoint SHALL apply both the package continuation rubric and the agent's supplemental focus

#### Scenario: Caller omits summary focus
- **WHEN** targeted compaction starts without caller-provided focus
- **THEN** the generated checkpoint SHALL still apply the package continuation rubric

### Requirement: Validate a generated checkpoint before replacement
The extension SHALL validate a generated summary before allowing it to replace earlier context. A normal history summary SHALL be nonempty and contain the required continuation sections in the required order with meaningful content. A split-turn summary SHALL additionally contain a complete turn-context section with the original request, early progress, and context needed by the retained suffix; when no earlier history exists, the explicit no-prior-history form SHALL be accepted.

The validator SHALL reject unfilled template placeholders and SHALL report concrete validation failures suitable for a corrective retry.

#### Scenario: Normal summary is structurally complete
- **WHEN** the underlying compactor returns a nonempty history summary with all required sections in order and meaningful content
- **THEN** the extension SHALL accept the summary without an additional generation attempt

#### Scenario: Split-turn summary is structurally complete
- **WHEN** the underlying compactor returns a valid history or no-prior-history portion followed by complete split-turn context
- **THEN** the extension SHALL accept the summary without an additional generation attempt

#### Scenario: Summary is incomplete
- **WHEN** a generated summary is empty, malformed, missing required content, or contains an unfilled template placeholder
- **THEN** the extension SHALL reject that attempt and identify the failed validation conditions

### Requirement: Repair one invalid generation safely
When the first generated summary fails validation, the extension SHALL make exactly one corrective generation attempt from the same compaction input. The corrective instructions SHALL preserve the package rubric and original caller focus and SHALL identify the structural failures that must be repaired.

If the corrective attempt is valid, the extension SHALL use it for the checkpoint and SHALL account for model usage from both generation attempts. If the corrective attempt remains invalid, the extension SHALL cancel targeted compaction, notify the user, and leave the existing context unchanged.

#### Scenario: Corrective generation succeeds
- **WHEN** the first summary is invalid and the single corrective attempt produces a valid summary
- **THEN** the extension SHALL create the checkpoint from the corrected summary and record the combined usage of both attempts

#### Scenario: Corrective generation remains invalid
- **WHEN** both the initial and corrective summaries fail validation
- **THEN** the extension SHALL cancel compaction, notify the user of the validation failure, and SHALL NOT replace earlier context

#### Scenario: Underlying compaction throws an error
- **WHEN** the underlying compactor fails instead of returning a summary
- **THEN** the extension SHALL retain its existing failure behavior and SHALL NOT add a package-level retry beyond the underlying compactor's own retry handling

### Requirement: Preserve targeted compaction compatibility
Validated summary generation SHALL preserve the selected first-retained boundary, retained context, previous-summary input, file-operation metadata, targeted-compaction provenance, active model and credentials, configured token budget, and cancellation signal supplied by the existing targeted compaction flow.

Native manual compaction, automatic threshold compaction, and overflow recovery SHALL remain unchanged when no user- or agent-directed targeted compaction is pending.

#### Scenario: Validated targeted compaction completes
- **WHEN** an initial or corrected summary passes validation
- **THEN** the resulting checkpoint SHALL retain the selected boundary and existing targeted-compaction metadata without changing later context

#### Scenario: Native Pi compaction occurs
- **WHEN** Pi compacts without a pending targeted compaction request
- **THEN** the package SHALL NOT apply its rubric, validation, or corrective retry
