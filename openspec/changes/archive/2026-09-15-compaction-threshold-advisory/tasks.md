## 1. Shared Targeted Compaction Execution

- [x] 1.1 Extract Pi authentication, targeted-input construction, validated compaction, and provenance assembly from `extensions/compact-until.ts` into a reusable targeted executor; verify existing `/compact-until` and scheduled-agent tests pass unchanged.
- [x] 1.2 Give the executor typed failure results or errors so explicit callers can cancel while threshold callers can fall back; verify focused tests cover credential, generation, validation-repair, and cancellation failures for both policies.

## 2. Advisory Policy, Options, and State

- [x] 2.1 Add the advisory threshold parser and compaction-epoch policy with a 70-percent default and once-per-epoch gating; verify unit tests cover valid, invalid, unavailable-usage, reload, and new-epoch cases.
- [x] 2.2 Build conservative token metrics and deterministic selection of at most four diverse safe targeted options plus native handling; verify unit tests cover user-boundary preference, redundant-option removal, agent-checkpoint admission, unsafe-headroom exclusion, and stable opaque option IDs.
- [x] 2.3 Add versioned custom-entry offer persistence and active-branch decision reconstruction from tool-result details; verify tests cover response supersession, branch exclusion, session mismatch, stale boundary, reload restoration, and compaction-epoch expiry.

## 3. Agent Advisory Interface

- [x] 3.1 Register `--compact-until-advisory-threshold` and the `choose_compaction_boundary` tool without changing the existing discovery and scheduling tools; verify registration tests cover schemas, prompt guidance, invalid offer or option rejection, native choice, targeted choice, and supplemental focus.
- [x] 3.2 Add one-call advisory injection through the `context` event and persist its hidden offer marker without retaining advisory prose in later model context; verify lifecycle tests prove the offer appears once, does not compact, survives reload as state, and is omitted when usage or safe options are unavailable.

## 4. Threshold Application and Native Fallback

- [x] 4.1 Extend `session_before_compact` dispatch to apply a revalidated targeted preference only for the `threshold` reason; verify an integration test proves the selected message and later entries remain verbatim and the saved checkpoint records advisory and threshold provenance.
- [x] 4.2 Add trigger-time retained-tail and headroom validation using Pi's resolved preparation settings; verify stale, off-branch, oversized, missing, ignored, and native decisions all return no override and preserve Pi's native threshold preparation.
- [x] 4.3 Preserve native manual and overflow paths and fall back to native threshold compaction after advisory targeted-generation or repair failure; verify tests prove advisory processing never cancels these native paths or retries overflow through the targeted flow.
- [x] 4.4 Verify interaction with explicit agent scheduling: an immediate scheduled compaction retains its existing settled-run behavior and the resulting new epoch invalidates any earlier advisory preference.

## 5. Documentation and Release Verification

- [x] 5.1 Update `README.md` with the soft-threshold lifecycle, deterministic option semantics, response tool, configuration flag, contiguous-suffix limitation, and native fallback guarantees; verify documented names and defaults match the registered interfaces.
- [x] 5.2 Run `pnpm typecheck`, `pnpm test`, and `pnpm pack:dry-run`; verify all commands succeed and the package contains only the intended distributable files.
