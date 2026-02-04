# Changelog

All notable changes to the Synesis Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-02-03

### Fixed
- **Relations/Codes/Ontology**: Improved path normalization (including `file://` URIs) to restore navigation to source locations.
- **Go to Definition**: Uses first occurrence with a valid file before falling back to text search.

### Changed
- **Ontology Explorers**: Now consume LSP-only data (`getOntologyTopics` / `getOntologyAnnotations`).
- **LSP Validation**: Added custom method checks for ontology endpoints.

## [0.5.1] - 2026-02-03

### Fixed
- **SynesisParser**: Fixed duplicate field handling - fields with same name now correctly accumulate in arrays instead of overwriting
- **AbstractViewer**: Fixed display of multiple notes and chains - now creates separate excerpts for each (note, chain) pair instead of concatenating all values
- **OntologyAnnotationExplorer**: Fixed crash when processing array field values - added proper array handling for duplicate fields
- **Code Explorer**: Fixed non-clickable occurrences - added null checks for file paths and fallback display when location unavailable
- **Relation Explorer**: Fixed non-clickable triplets - added null checks and visual feedback (question mark icon) for items without location
- **GraphViewer**: Added local fallback for bibref extraction when LSP not available - now works without LSP using SynesisParser
- **Explorer Titles**: Added visual feedback showing "(LSP Loading...)" during LSP initialization

### Added
- **Comprehensive Diagnostic Logging**: Added extensive console logging in DataService, CodeExplorer, RelationExplorer for troubleshooting
  - Logs workspaceRoot, raw LSP data, and processed file paths
  - Warnings for null/undefined file paths
  - Helps identify LSP data issues quickly
- **Null-Safe TreeItems**: Code and Relation explorers now handle missing file locations gracefully
- **Visual Indicators**: Items without locations show question mark icon and "(no location)" description
- **Documentation**: Created BUGS_FIXED.md documenting all issues and fixes, RELOAD_EXTENSION.md with testing instructions

### Changed
- **Field Value Collection**: `collectFieldValues()` in AbstractViewer now properly handles both string and array field values
- **Explorer Error Handling**: Explorers now continue working even when some items lack location data
- **Path Resolution**: Enhanced path resolution logging in DataService for easier debugging

### Technical Details
- Modified `_addFieldValue()` in SynesisParser to accumulate duplicate fields into arrays
- Updated `collectFieldValues()` to iterate over array values when present
- Added `_findBibrefLocal()` to GraphViewer with three fallback strategies (ITEM → SOURCE → inline)
- Enhanced OccurrenceTreeItem and TripletTreeItem with null checks before accessing file paths
- Added `updateExplorerTitles()` function for LSP status feedback

### Breaking Changes
None - all changes are backward compatible

### Known Issues
- GraphViewer may show all chains from project instead of filtering by bibref (LSP server issue, not extension)

## [0.5.0] - 2026-02-02

### Added
- **LSP Strict Mode Now Default**: `synesisExplorer.lsp.strict` now defaults to `true` for LSP-only operation
- **New LSP Endpoints Support**: Added DataService methods for `synesis/getOntologyTopics` and `synesis/getOntologyAnnotations`
- **LSP-Exclusive Methods**: Ontology methods added to exclusive methods set (no regex fallback)
- **Deprecation Warnings**: LocalRegexProvider logs warnings when fallback to regex parsing occurs
- **LSP Capabilities Validation**: Automatic validation of LSP server capabilities on startup with detailed warnings
- **Enhanced Debug Logging**: Comprehensive logging in DataService and GraphViewer for troubleshooting
- **Troubleshooting Guide**: New `LSP_TROUBLESHOOTING.md` with diagnostic checklist and common solutions

### Changed
- **100% LSP Coverage**: All data retrieval now operates via LSP by default
- **No Regex Fallback by Default**: Local regex parsing only used if LSP unavailable and strict mode disabled
- **Improved Error Messages**: Clearer warnings when LSP is required but unavailable
- **Configuration Description**: Updated `lsp.strict` setting description for better clarity

### Technical Notes
- DataService now includes `getOntologyTopics()` and `getOntologyAnnotations()` in public API
- Both new methods added to `DEFAULT_LSP_EXCLUSIVE_METHODS` constant
- LocalRegexProvider stub methods emit console warnings (deprecated)
- `_resolveLspMethodName()` and `_emptyResultFor()` updated to support new methods
- Requires Synesis LSP v0.13.0+ for full functionality

### Migration Guide
- Users with `lsp.strict: false` in settings will need to update to `lsp.strict: true` or ensure LSP is properly installed
- Existing installations with LSP v0.13.0+ will work seamlessly
- Fallback to regex still available by setting `synesisExplorer.lsp.strict: false`

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

### Changed
- Removed local regex fallback; all data requests are LSP-only
- Removed `synesisExplorer.lsp.strict` setting (LSP is always required)

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
