# Changelog

All notable changes to the Synesis Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-01-14

### Added
- **Ontology Topics Explorer**: New tree view for browsing TOPIC, ORDERED, and ENUMERATED fields in `.syno` files
- **Ontology Annotations Explorer**: View ontology annotations directly from `.syn` files
- New commands: `synesis.ontology.refresh` and `synesis.ontology.filter`
- Conditional view visibility based on active file type (`.syn` vs `.syno`)

### Changed
- Views now dynamically show/hide based on file context
- Improved context awareness for ontology-related features

## [0.2.0] - 2025-01-14

### Added
- **Relation Explorer**: Tree view for CHAIN relations with triplet visualization (A → REL → B)
- **Graph Viewer**: Interactive Mermaid.js visualization for relation graphs
- **Abstract Viewer**: BibTeX abstract display with highlighted excerpts
- Chain parser for extracting relation triplets
- Keyboard shortcuts:
  - `Ctrl+Alt+G` (Mac: `Cmd+Shift+G`): Show Relation Graph
  - `Ctrl+Shift+A` (Mac: `Cmd+Shift+A`): Show Abstract
- File icon theme for Synesis and BibTeX files

### Changed
- Enhanced syntax highlighting with dark and light themes
- Improved parser performance for large files

## [0.1.0] - 2025-01-13

### Added
- **Initial release**
- **Reference Explorer**: Tree view listing all `SOURCE @bibref` with ITEM counts
- **Code Explorer**: Tree view for CODE and CHAIN field values
- Basic syntax highlighting for `.syn`, `.synt`, `.synp`, `.syno` files
- Workspace scanner for automatic file discovery
- Template manager with lazy loading and caching
- Navigation support (click to jump to source location)
- Auto-refresh on file save
- Regex-based parser (MVP solution)

### Technical Notes
- Parser uses regex instead of Lark.js due to Unicode property incompatibility (`\p{L}`)
- Fallback to default templates when `.synt` not available

## [Unreleased]

### Planned
- IntelliSense for ontology codes (cross-file completion)
- Hover information for code definitions
- Go to Definition support
- Smart snippets for ITEM/ONTOLOGY blocks
- Smart Paste command for quick item creation

---

[0.3.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.3.0
[0.2.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.2.0
[0.1.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.1.0
