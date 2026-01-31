# Synesis Explorer

[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](CHANGELOG.md)
[![VSCode](https://img.shields.io/badge/VSCode-%3E%3D1.60.0-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**[Leia em Português](README.pt-BR.md)**

A Visual Studio Code extension for navigating and visualizing Synesis knowledge synthesis files (`.syn`, `.synt`, `.synp`, `.syno`).

![Synesis Explorer](synesis-icon.png)

## Overview

Synesis Explorer provides a comprehensive set of tools for working with the Synesis knowledge synthesis format, designed for qualitative research and bibliometric analysis. The extension offers tree-based navigation, relationship visualization, and seamless integration with BibTeX references.

## Features

### LSP Integration

Full Language Server Protocol support for enhanced editing and navigation.

- **Diagnostics**: Real-time syntax error detection with squiggles
- **Semantic Highlighting**: Context-aware colorization for keywords, bibrefs, fields, and codes
- **Hover Information**: Contextual info for `@bibref`, fields, and codes
- **Go to Definition**: `Ctrl+Click` on `@bibref` or code to jump to definition
- **Autocomplete**: `@bibrefs`, ontology codes, and template fields
- **Rename Symbol**: `F2` to rename codes or references across all files
- **Inlay Hints**: Author and year displayed inline after `@bibref`
- **Document Symbols**: Outline view with SOURCE/ITEM/ONTOLOGY hierarchy
- Automatic fallback to local regex parsing when LSP is unavailable

### Reference Explorer

Browse all bibliographic references (`SOURCE @bibref`) in your workspace with item counts.

- Lists all `SOURCE` blocks with their `@bibref` identifiers
- Shows the number of `ITEM` blocks for each reference
- Click to navigate directly to the source location
- Right-click to rename references across all files (requires LSP)
- Filter references by name
- Auto-refresh when files are saved

### Code Explorer

Navigate through all codes defined in your synthesis files.

- Lists values from `CODE` fields
- Extracts codes from `CHAIN` fields
- Template-aware: adapts to your project's field definitions
- Differentiated icons for ontology-defined codes vs. usage-only codes
- Right-click to go to definition in ontology (requires LSP)
- Right-click to rename codes across all files (requires LSP)
- Filter codes by name
- Click to jump to code usage

### Relation Explorer

Visualize relationships defined in CHAIN fields as triplets.

- Displays relations as: `Subject → Relation → Object`
- Supports both qualified and simple chains
- Filter relations by any component
- Navigate to relation definitions

### Ontology Topics Explorer

Browse ontology definitions in `.syno` files.

- Lists values from `TOPIC`, `ORDERED`, and `ENUMERATED` fields
- Organized by field name
- Only visible when editing `.syno` files

### Ontology Annotations Explorer

View ontology annotations directly from `.syn` files.

- Shows how ontology codes are applied to items
- Cross-reference between synthesis and ontology

### Graph Viewer

Interactive visualization of relationship networks using Mermaid.js.

- Renders CHAIN relations as a directed graph
- Context-aware: shows relations for current reference or entire file
- Keyboard shortcut: `Ctrl+Alt+G` (Mac: `Cmd+Shift+G`)

### Abstract Viewer

Display BibTeX abstracts with highlighted excerpts.

- Parses linked `.bib` files
- Highlights text excerpts from your synthesis
- Keyboard shortcut: `Ctrl+Shift+A` (Mac: `Cmd+Shift+A`)

### Syntax Highlighting

Full syntax support for Synesis file formats.

- Keywords: `SOURCE`, `ITEM`, `ONTOLOGY`, `END`
- Field names and values
- BibTeX references (`@identifier`)
- Chain relations
- Comments

### Themes

Included color themes optimized for Synesis files.

- **Synesis Dark**: Dark theme with enhanced readability
- **Synesis Light**: Light theme for daytime work

### File Icons

Custom file icons for easy identification.

- `.syn` - Synthesis files
- `.synt` - Template files
- `.synp` - Project files
- `.syno` - Ontology files
- `.bib` - BibTeX files

## Installation

### From VSIX (Local)

1. Download the `.vsix` file from [Releases](https://github.com/your-username/synesis-explorer/releases)
2. Open VSCode
3. Press `Ctrl+Shift+P` and run "Extensions: Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/your-username/synesis-explorer.git
cd synesis-explorer
npm install
npm run build
```

Press `F5` to open the Extension Development Host.

### Building the VSIX Package

To create a distributable `.vsix` package:

```bash
# Install vsce globally (if not already installed)
npm install -g @vscode/vsce

# Build the extension
npm run build

# Package the extension
npm run package
```

This will generate a `synesis-explorer-x.x.x.vsix` file in the project root.

## Usage

### Quick Start

1. Open a folder containing Synesis files (`.syn`, `.syno`, etc.)
2. Click the Synesis Explorer icon in the Activity Bar (sidebar)
3. Browse references, codes, and relations in the tree views
4. Click any item to navigate to its location

### File Types

| Extension | Description |
|-----------|-------------|
| `.syn` | Main synthesis file containing SOURCE and ITEM blocks |
| `.synt` | Template file defining field structure |
| `.synp` | Project file with includes and configuration |
| `.syno` | Ontology file with TOPIC/ORDERED/ENUMERATED definitions |

### Keyboard Shortcuts

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Alt+G` | Show Graph | Display relation graph (Mac: `Cmd+Shift+G`) |
| `Ctrl+Shift+A` | Show Abstract | Display BibTeX abstract (Mac: `Cmd+Shift+A`) |

### Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`):

- `Synesis: LSP Load Project` - Manually load/reload the project in the LSP server
- `Synesis: Show Relation Graph` - Open the graph viewer
- `Synesis: Show Abstract` - Open the abstract viewer
- `Refresh References` - Re-scan reference list
- `Filter References` - Filter by reference name
- `Refresh Codes` - Re-scan code list
- `Filter Codes` - Filter by code name
- `Refresh Relations` - Re-scan relation list
- `Filter Relations` - Filter by relation component
- `Refresh Ontology Topics` - Re-scan ontology topics
- `Filter Ontology Topics` - Filter by topic name

Context menu commands (right-click in tree views):

- `Go to Definition` - Navigate to code definition in `.syno` (Code Explorer)
- `Rename Code` - Rename a code across all files (Code Explorer)
- `Rename Reference` - Rename a reference across all files (Reference Explorer)

## Configuration

### LSP Server

By default the extension starts the LSP with `python -m synesis_lsp`. If you have the
standalone executable, point the setting to it instead.

```json
{
  "synesisExplorer.lsp.pythonPath": "synesis-lsp"
}
```

### Activating File Icons

1. Open VSCode Settings
2. Go to `File > Preferences > File Icon Theme`
3. Select "Synesis File Icons"

### Activating Color Themes

1. Open VSCode Settings
2. Go to `File > Preferences > Color Theme`
3. Select "Synesis Dark" or "Synesis Light"

## Project Structure

```
Synesis-Explorer/
├── extension.js           # Entry point
├── src/
│   ├── core/              # Core services
│   │   ├── templateManager.js
│   │   ├── projectLoader.js
│   │   ├── workspaceScanner.js
│   │   └── fieldRegistry.js
│   ├── lsp/               # LSP client
│   │   └── synesisClient.js
│   ├── services/          # Data services
│   │   └── dataService.js # Adapter: LSP vs local regex
│   ├── parsers/           # File parsers
│   │   ├── synesisParser.js
│   │   ├── ontologyParser.js
│   │   ├── templateParser.js
│   │   ├── chainParser.js
│   │   └── bibtexParser.js
│   ├── explorers/         # Tree view providers
│   │   ├── reference/
│   │   ├── code/
│   │   ├── relation/
│   │   └── ontology/
│   ├── viewers/           # Webview panels
│   │   ├── graphViewer.js
│   │   └── abstractViewer.js
│   └── utils/
│       └── mermaidUtils.js
├── syntaxes/              # TextMate grammars
├── themes/                # Color themes
├── icons/                 # File icons
└── test/                  # Unit tests
```

## Requirements

- Visual Studio Code 1.60.0 or higher

## Dependencies

- [bibtex-parse-js](https://www.npmjs.com/package/bibtex-parse-js) - BibTeX parser
- [vscode-languageclient](https://www.npmjs.com/package/vscode-languageclient) - LSP client for VSCode (v9.x)

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Synesis format specification and compiler
- VSCode Extension API documentation
- Mermaid.js for graph visualization

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

---

**Synesis Explorer** - Empowering qualitative research with structured knowledge synthesis.
