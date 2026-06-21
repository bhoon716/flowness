# Release Notes Template

Use this template for a single release. Keep it human-readable and avoid pasting raw git logs.

## Summary

- One short paragraph describing the release.

## Added

- New user-visible capabilities.

## Changed

- Behavior updates, defaults, or documentation changes, including workflow reordering after `flowness init`, rule approval prompts, and rule history/log changes.
- Documentation changes that reshape the default user model, including conversational-first README updates, translated guides, and the performance troubleshooting / evidence summary docs.
- Follow-up concern handling that links approved split work to a parent issue so deferrable concerns can be tracked without blocking closure.

## Fixed

- Bug fixes and corrections.
- Review gate fixes, including finding lifecycle updates, deferrable blocker handling, and evidence summary contract corrections.

## Migration Notes

- What existing users need to do, if anything.

## Breaking Changes

- Any incompatible changes or deprecations.

## Commands

- New, changed, or removed commands.

## Verification

- Build, test, audit, and packaging checks that were run.
- Include `npm pack --dry-run --workspace packages/cli` when package metadata or README output changes.

## Known Limitations

- Anything intentionally left out or deferred.
- Note any performance evidence limitations, raw artifact paths, or intentionally deferred follow-up issues.
