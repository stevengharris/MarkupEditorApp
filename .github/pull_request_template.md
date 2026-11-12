<!-- Thanks for contributing to MarkupEditor! Please keep PRs small and focused. -->

## Summary

<!-- What does this change do, and why? -->

## Related issues

<!-- e.g. Closes #123 -->

## Checklist

- [ ] The app builds (`xcodebuild -scheme MarkupEditorApp -destination platform=macOS build`)
- [ ] Tests pass (`xcodebuild test`, and `swift test` in `MarkupEditorAppLib`)
- [ ] Tests added or updated for this change
- [ ] Docs or release notes updated if behavior changed
- [ ] Change is small and focused (single purpose)

## Plugins

Only relevant if this pull request is about a plugin. Delete this section otherwise.

- [ ] The plugin is in `plugins/<type>-<name>/` and has a `README.md` that says what it does and how to use it
- [ ] `version` in its `package.json` is set
- [ ] `npm run build` was run in the plugin and the built `dist/` file is committed
- [ ] `npm test` passes in the plugin
- [ ] `package-lock.json` is updated (`npm install` from the repository root)

`plugins/plugins.json` is regenerated after the merge, so it does not need to be edited here. See [Contributing a Plugin](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins#contributing-a-plugin).

## Notes for reviewers

<!-- Anything that needs special attention, trade-offs, follow-ups. -->
