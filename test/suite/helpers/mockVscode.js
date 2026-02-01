/**
 * mockVscode.js - Mock mínimo do módulo 'vscode' para testes unitários
 *
 * Instala um mock no require cache antes que qualquer módulo dependente
 * de 'vscode' seja carregado. Deve ser chamado antes de require() nos
 * módulos sob teste.
 */

const Module = require('module');
const path = require('path');

const vscodeMock = {
    TreeItem: class TreeItem {
        constructor(label, collapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class ThemeIcon {
        constructor(id) { this.id = id; }
    },
    EventEmitter: class EventEmitter {
        constructor() { this._listeners = []; }
        get event() { return (listener) => this._listeners.push(listener); }
        fire(data) { this._listeners.forEach(l => l(data)); }
    },
    Uri: {
        file: (fsPath) => ({ fsPath, scheme: 'file' })
    },
    workspace: {
        findFiles: async () => [],
        getWorkspaceFolder: () => null,
        workspaceFolders: [],
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue,
            update: async () => {}
        }),
        fs: {
            readFile: async () => Buffer.from('')
        },
        createFileSystemWatcher: () => ({
            onDidChange: () => ({ dispose: () => {} }),
            onDidCreate: () => ({ dispose: () => {} }),
            onDidDelete: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },
    window: {
        showWarningMessage: () => {},
        showErrorMessage: () => {},
        showInformationMessage: () => {},
        showQuickPick: async () => null,
        showInputBox: async () => null,
        activeTextEditor: null,
        createStatusBarItem: () => ({
            show: () => {},
            hide: () => {},
            dispose: () => {},
            text: '',
            tooltip: ''
        }),
        createTreeView: () => ({ dispose: () => {} }),
        createOutputChannel: () => ({
            appendLine: () => {},
            append: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {}
        })
    },
    commands: {
        executeCommand: async () => {},
        registerCommand: () => ({ dispose: () => {} })
    },
    RelativePattern: class RelativePattern {
        constructor(base, pattern) {
            this.base = base;
            this.pattern = pattern;
        }
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Window: 10 },
    ConfigurationTarget: { Workspace: 2 },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Selection: class Selection {
        constructor(anchor, active) {
            this.anchor = anchor;
            this.active = active;
        }
    },
    TextEditorRevealType: { InCenter: 2 }
};

const originalResolveFilename = Module._resolveFilename;
let installed = false;

function install() {
    if (installed) {
        return;
    }
    installed = true;

    Module._resolveFilename = function (request, parent) {
        if (request === 'vscode') {
            return 'vscode';
        }
        return originalResolveFilename.call(this, request, parent);
    };

    require.cache['vscode'] = {
        id: 'vscode',
        filename: 'vscode',
        loaded: true,
        exports: vscodeMock
    };
}

function uninstall() {
    if (!installed) {
        return;
    }
    installed = false;
    Module._resolveFilename = originalResolveFilename;
    delete require.cache['vscode'];
}

module.exports = { install, uninstall, vscodeMock };
