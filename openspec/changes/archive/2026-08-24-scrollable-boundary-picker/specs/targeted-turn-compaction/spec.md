## ADDED Requirements

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
