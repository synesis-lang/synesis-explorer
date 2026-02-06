# Synesis Explorer

> **Visual navigation and LSP-powered editing for Synesis projects.**

Synesis Explorer is a Visual Studio Code extension for working with Synesis files (`.syn`, `.synp`, `.synt`, `.syno`). It provides tree views for references, codes, relations, and ontologies, plus LSP-backed editor features such as diagnostics, rename, and go-to-definition.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VSCode >=1.60](https://img.shields.io/badge/VSCode-%3E%3D1.60.0-blue.svg)](https://code.visualstudio.com/)

## Overview

Synesis Explorer is the UX layer of the Synesis ecosystem. It connects to Synesis LSP to provide reliable, template-driven data and navigation across your project.

## Features

- Tree explorers for References, Codes, Relations, Ontology Topics, and Ontology Annotations
- LSP-only data access (no regex fallback)
- Real-time diagnostics and semantic tokens
- Hover, completion, inlay hints, and document symbols
- Go-to-definition for bibrefs and ontology codes
- Rename with F2 (codes and references)
- Relation graph viewer (Mermaid)
- Abstract viewer (BibTeX abstracts with highlights)
- Synesis Dark and Light themes
- Custom file icons for Synesis extensions

## Requirements

- VSCode 1.60+
- Synesis LSP v0.13.0+ installed and on PATH
- Synesis compiler installed (required by the LSP)

## Installation

### From VSIX

1. Download the `.vsix` from the release page:
   - `https://github.com/synesis-lang/synesis-explorer/releases`
2. In VSCode: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."

### From Source

```bash
git clone https://github.com/synesis-lang/synesis-explorer.git
cd synesis-explorer
npm install
npm run build
```

Press `F5` to open the Extension Development Host.

## Quick Start

1. Open a workspace that contains a `.synp` file.
2. Ensure `synesis-lsp` is installed and available.
3. Open the Synesis Explorer view from the Activity Bar.
4. Use the tree views to navigate references, codes, and relations.

## Configuration

Configure the LSP executable and arguments in VSCode settings:

```json
{
  "synesisExplorer.lsp.pythonPath": "synesis-lsp",
  "synesisExplorer.lsp.args": []
}
```

If you need to run the LSP as a Python module:

```json
{
  "synesisExplorer.lsp.pythonPath": "python",
  "synesisExplorer.lsp.args": ["-m", "synesis_lsp"]
}
```

## Commands and Shortcuts

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Synesis: Show Relation Graph` | `Ctrl+Alt+G` | Open relation graph viewer |
| `Synesis: Show Abstract` | `Ctrl+Shift+A` | Open abstract viewer |
| `Synesis: LSP Load Project` | — | Reload project in LSP |
| `Rename Code` | `F2` | Rename selected code in Codes Explorer |
| `Rename Reference` | `F2` | Rename selected reference in References Explorer |

Context menus:
- Codes Explorer: Go to Definition
- References Explorer: Rename Reference

## Project Structure

```
synesis-explorer/
├── extension.js           # Entry point
├── src/
│   ├── core/              # Workspace + template handling
│   ├── lsp/               # LSP client wrapper
│   ├── services/          # DataService (LSP-only)
│   ├── explorers/         # Tree view providers
│   ├── viewers/           # Graph + abstract viewers
│   └── utils/             # Shared utilities
├── syntaxes/              # TextMate grammars
├── themes/                # Color themes
├── icons/                 # File icons
└── test/                  # Extension tests
```

## Development

```bash
npm run build
npm run test
npm run package
```

The build outputs to `dist/`.

## License

MIT License - Synesis Project.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
