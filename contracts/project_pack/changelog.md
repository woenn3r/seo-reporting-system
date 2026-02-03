# Project Pack Contract Changelog

## v1 (current)
- Initial version of `project.json` schema.
- Breaking changes require a new major version (v2) and migration notes.

## Breaking Change Policy
- Any change that removes/renames fields, changes types, or alters required fields is **breaking**.
- Breaking changes MUST:
  - bump the contract version (v2, v3, ...)
  - include migration notes in this file
  - update examples + tests
