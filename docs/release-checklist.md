# Release Checklist

Use this checklist for every Flowness version bump. Keep it compact, human-readable, and version-specific.

## Documentation Map

- GitHub README: `README.md`
- npm README for the CLI package / command reference: `packages/cli/README.md`
- Changelog: `CHANGELOG.md`
- Release notes template: `docs/templates/release-notes.md`
- Versioned release notes: `docs/releases/<version>.md`

If the GitHub README and npm README ever become the same file, record that here before the release is cut. If they are separate, update both files together.

## Checklist

- [ ] Version number
- [ ] Release type: patch / minor / major
- [ ] User-visible changes
- [ ] Migration or upgrade notes
- [ ] New commands
- [ ] Changed commands
- [ ] Removed or deprecated commands
- [ ] GitHub README updated
- [ ] npm README / package docs updated
- [ ] CHANGELOG updated
- [ ] package.json metadata updated
- [ ] Tests, build, and audit passed
- [ ] `npm run release:check` passed
- [ ] `npm pack --dry-run` reviewed
- [ ] Final release notes prepared

## Command Documentation Rules

- If CLI commands change, update both README files and the release notes.
- Keep the post-init workflow description aligned with the "initialize once, then talk to the coding agent" flow.
- Keep `flowness locate`, `flowness test --summary`, `flowness audit --changed`, and `flowness upgrade` documented.
- Keep `rule-update-log.md` and `docs/troubleshooting/performance-improvements.md` in the release notes if they are user-visible changes.
- Keep the generated command reference in `packages/cli/README.md` in sync with the command surface that ships in the package.

## Notes

- Put unreleased items at the top of `CHANGELOG.md` until the release is cut.
- Move relevant `Unreleased` entries into the version entry when tagging a release.
