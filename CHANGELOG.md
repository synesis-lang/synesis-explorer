# Changelog

All notable changes to the Synesis Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-02-01

### Added
- `synesisExplorer.lsp.args` setting to pass command arguments to the LSP executable (e.g. `["-m", "synesis_lsp"]`)

## [0.4.0] - 2025-01-31

### Added
- **LSP Integration**: Full Language Server Protocol support with automatic fallback to local regex parsing
  - Synesis LSP client (`vscode-languageclient` v9.x) connecting to Python-based LSP server
  - DataService adapter pattern: LSP-first with silent fallback to local parsing
  - Configurable via `synesisExplorer.lsp.enabled` and `synesisExplorer.lsp.pythonPath`
  - Status bar indicator showing LSP connection state
  - `Synesis: LSP Load Project` command for manual project loading
  - Auto-reload on file save (`.syn`, `.syno`, `.synp`, `.synt`, `.bib`)
- **Go to Definition**: Right-click a code in the Code Explorer to navigate to its ontology definition (`.syno`)
  - Requires LSP for cross-file definition resolution
- **Rename Symbol**: Right-click to rename codes or references across all workspace files
  - `Rename Code` in Code Explorer context menu
  - `Rename Reference` in Reference Explorer context menu
  - Cross-file rename powered by LSP `textDocument/rename`
- **LSP-powered features** (automatic when LSP is connected):
  - Diagnostics (syntax error squiggles)
  - Semantic token highlighting
  - Document symbols (Outline view)
  - Hover information for `@bibref`, fields, and codes
  - Inlay hints (author, year) after `@bibref`
  - Go-to-Definition via `Ctrl+Click`
  - Autocomplete for `@bibrefs`, ontology codes, and template fields
  - Signature help for field types
  - Rename via `F2`

### Changed
- **Reference Explorer**: Now uses DataService instead of direct parser access
- **Code Explorer**: Now uses DataService; codes show differentiated icons for ontology-defined vs. usage-only
- **Relation Explorer**: Now uses DataService; `hasChains` context derived from data availability
- **Graph Viewer**: Now uses DataService (`getRelationGraph`); removed ~150 lines of local chain parsing
- Extracted `mermaidUtils.js` for reusable Mermaid graph generation

### Technical Notes
- DataService implements Adapter Pattern with `LspDataProvider` and `LocalRegexProvider`
- All explorers and Graph Viewer consume normalized data shapes from DataService
- LSP fallback is transparent: `_tryLspThenLocal()` with warning-level logging
- Bundle includes all new modules via esbuild

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
- Smart snippets for ITEM/ONTOLOGY blocks
- Smart Paste command for quick item creation
- Ontology Explorers via LSP (requires new server endpoints)
- Abstract Viewer via LSP (requires new server endpoint)

---

[0.4.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.4.0
[0.4.1]: https://github.com/your-username/synesis-explorer/releases/tag/v0.4.1
[0.3.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.3.0
[0.2.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.2.0
[0.1.0]: https://github.com/your-username/synesis-explorer/releases/tag/v0.1.0
