## Purpose

Make targeted turn compaction installable and usable as a standard Pi package in local development and published environments.

## ADDED Requirements

### Requirement: Publishable Pi package metadata
The project SHALL declare itself as the `pi-compact-till` npm package and SHALL expose its extension through Pi package metadata so Pi can discover the command when installed.

#### Scenario: Package is installed through Pi
- **WHEN** a user installs the published package with `pi install npm:pi-compact-till`
- **THEN** Pi SHALL discover and load the targeted-compaction extension

### Requirement: Local development installation
The project SHALL document a local extension loading path that enables developers to try the package before publishing it.

#### Scenario: Developer tests a checkout
- **WHEN** a developer runs Pi against the local package using the documented command
- **THEN** the `/compact-until` command SHALL be available without publishing the package

### Requirement: Package compatibility declaration
The package SHALL declare Pi's coding-agent API as a peer dependency and SHALL not require a separate runtime service or telemetry configuration.

#### Scenario: Pi installs runtime dependencies
- **WHEN** Pi installs the package in production mode
- **THEN** the extension SHALL have all required runtime dependencies available through Pi or the package's production dependencies

