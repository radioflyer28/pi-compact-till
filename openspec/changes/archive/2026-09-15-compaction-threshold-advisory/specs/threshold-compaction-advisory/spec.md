## Purpose

Allow the active Pi agent to choose a semantically useful, capacity-safe retained boundary before automatic threshold compaction while preserving Pi's native timing and fallback behavior.

## ADDED Requirements

### Requirement: Offer a choice before automatic threshold compaction
The extension SHALL present the active agent with a compaction advisory when estimated context usage first reaches a configurable soft threshold within the current compaction epoch. The soft threshold SHALL default to a conservative value intended to leave sufficient context for at least one normal agent response before Pi's automatic threshold under its default settings.

The extension SHALL present at most one active advisory per compaction epoch. It SHALL NOT start compaction merely because the soft threshold is reached, and it SHALL omit the advisory when context usage is unavailable or no targeted option can be offered safely. If Pi reaches its automatic threshold before an advisory can be presented, native compaction SHALL proceed without delay.

#### Scenario: Context reaches the soft threshold
- **WHEN** estimated context usage first reaches the configured soft threshold and at least one safe targeted option is available
- **THEN** the next eligible agent context SHALL include one compaction advisory and normal agent work SHALL continue

#### Scenario: Agent continues without answering
- **WHEN** the agent ignores an advisory
- **THEN** the extension SHALL NOT start or schedule compaction solely because the advisory was presented

#### Scenario: Usage or options are unavailable
- **WHEN** context usage cannot be determined or no safe targeted option is available
- **THEN** the extension SHALL omit the advisory and leave Pi's compaction behavior unchanged

#### Scenario: Pi compacts before an offer is possible
- **WHEN** Pi reaches its automatic threshold before the extension presents an advisory
- **THEN** the extension SHALL allow native compaction to proceed without waiting for agent input

#### Scenario: Advisory has already been presented
- **WHEN** an advisory has already been presented in the current compaction epoch
- **THEN** the extension SHALL NOT repeatedly present another advisory unless the prior epoch has ended

### Requirement: Present deterministic and effective options
Each advisory SHALL contain Pi's native compaction choice and a bounded set of targeted options derived deterministically from the active branch's safe first-retained-message candidates. Every targeted option SHALL identify its user-exchange or agent-checkpoint kind, provide a readable preview of the first message retained verbatim, and report conservative estimates of retained context and context reclaimed.

The targeted option set SHALL favor user-exchange boundaries, SHALL avoid options with materially equivalent retention impact, and SHALL include an agent checkpoint only when it provides meaningfully different retention from the offered user-exchange choices. The extension SHALL NOT offer a tool-result boundary or an option projected to leave insufficient post-compaction headroom.

#### Scenario: Several safe boundaries exist
- **WHEN** the active branch contains several safe boundaries with meaningfully different retention impact
- **THEN** the advisory SHALL present a bounded, diverse subset together with Pi's native choice

#### Scenario: Candidate would retain too much context
- **WHEN** a structurally safe boundary is projected to leave insufficient post-compaction headroom
- **THEN** the extension SHALL exclude that boundary from the advisory

#### Scenario: Agent checkpoint provides no distinct value
- **WHEN** an agent checkpoint has materially equivalent retention impact to an offered user-exchange boundary
- **THEN** the extension SHALL prefer the user-exchange boundary and omit the redundant checkpoint

#### Scenario: Native choice remains available
- **WHEN** any advisory is presented
- **THEN** the agent SHALL be able to choose Pi's native threshold-compaction behavior instead of a targeted boundary

### Requirement: Record an advisory response without compacting
The extension SHALL expose a model-callable advisory-response tool that accepts the active offer identifier, either one offered targeted option or the native choice, and optional summary focus. A valid response SHALL record a one-shot preference scoped to the active session branch and compaction epoch and SHALL NOT invoke compaction.

The tool SHALL reject an unknown, expired, stale, or mismatched offer or option without recording a preference. A later valid response for the same active offer SHALL replace the earlier response.

#### Scenario: Agent chooses a targeted option
- **WHEN** the agent responds to the active advisory with an offered targeted option
- **THEN** the extension SHALL record that boundary as the preference for the next automatic threshold compaction and SHALL continue the active run

#### Scenario: Agent chooses native behavior
- **WHEN** the agent responds to the active advisory with the native choice
- **THEN** the extension SHALL record that threshold compaction should remain native for the current epoch

#### Scenario: Agent supplies summary focus
- **WHEN** the agent includes summary focus with a valid targeted response
- **THEN** the extension SHALL retain that focus for use as supplemental focus if the targeted preference is later applied

#### Scenario: Agent responds to an invalid offer
- **WHEN** the agent supplies an unknown offer, an option not contained in that offer, or an offer from another branch or epoch
- **THEN** the tool SHALL reject the response and SHALL NOT alter compaction behavior

### Requirement: Apply a valid preference at Pi's threshold
When Pi initiates automatic compaction for the threshold reason, the extension SHALL revalidate the latest targeted preference against the current active branch and current capacity requirements. If the preference remains structurally safe and is projected to create sufficient headroom, the extension SHALL use its selected message as the first entry retained verbatim and SHALL summarize the preceding active context through the package's targeted compaction flow.

A successfully applied preference SHALL be consumed and SHALL record advisory provenance, including the offer, selected boundary kind, first-retained entry, and threshold trigger, without duplicating conversation content in metadata.

#### Scenario: Preferred boundary remains valid
- **WHEN** Pi initiates threshold compaction and the active targeted preference remains safe and effective
- **THEN** the extension SHALL compact at that boundary and retain the selected message and every later entry verbatim

#### Scenario: Preference becomes ineffective
- **WHEN** Pi initiates threshold compaction and the preferred retained suffix has grown too large to provide sufficient headroom
- **THEN** the extension SHALL ignore the preference and allow Pi's native threshold compaction

#### Scenario: Preference is no longer on the active branch
- **WHEN** Pi initiates threshold compaction after branch or session state has invalidated the preferred boundary
- **THEN** the extension SHALL ignore the preference and allow Pi's native threshold compaction

#### Scenario: Advisory-selected compaction succeeds
- **WHEN** a valid targeted preference is successfully applied
- **THEN** the saved checkpoint SHALL identify the advisory-selected boundary and threshold trigger for later inspection

### Requirement: Preserve fail-safe native behavior
Missing, ignored, declined, stale, unsafe, ineffective, malformed, or failed advisory behavior SHALL fall back to Pi's native threshold compaction without cancelling the native operation. Native manual compaction and overflow recovery SHALL remain unchanged by advisory preferences.

Any completed compaction, session replacement, or branch change that excludes the recorded response SHALL expire that response. An expired preference SHALL NOT be reused in a later compaction epoch.

#### Scenario: No advisory response exists
- **WHEN** Pi initiates threshold compaction without a valid recorded targeted preference
- **THEN** Pi SHALL use its native threshold-compaction preparation and cutoff

#### Scenario: Targeted advisory processing fails
- **WHEN** advisory validation or targeted compaction processing fails during a threshold event
- **THEN** the extension SHALL allow Pi's native threshold compaction to proceed

#### Scenario: Overflow recovery starts
- **WHEN** Pi initiates compaction for overflow recovery
- **THEN** the extension SHALL ignore advisory preferences and preserve Pi's native overflow behavior

#### Scenario: Manual compaction starts
- **WHEN** Pi initiates native manual compaction
- **THEN** the extension SHALL ignore advisory preferences and preserve Pi's native manual behavior

#### Scenario: Compaction epoch ends
- **WHEN** any compaction completes
- **THEN** the prior advisory and response SHALL expire and SHALL NOT affect a later compaction
