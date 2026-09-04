# Search space-key fix

Fixed an issue where spaces disappeared while typing in the catalogue search box.

Cause:
`setCatalogSearch()` trimmed the query after every input event, and the UI then wrote
the trimmed value back into the active search input.

Fix:
- Preserve the exact typed value, including spaces.
- Normalize only for matching.
- Do not rewrite the search input while it is focused.
- Keep result status text trimmed for display.

Example now works:
`Temple Bangles`
`Anti Tarnish Bracelet`
`Hair Accessories`

Validation:
- `node --check app.js` PASSED.
