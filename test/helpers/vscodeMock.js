'use strict';

/**
 * vscodeMock.js — Stub mínimo do módulo 'vscode' para testes Node (sem Electron).
 *
 * Registra o stub em require.cache antes de importar qualquer módulo
 * que dependa de 'vscode'. Use assim no topo do arquivo de teste:
 *
 *   require('../helpers/vscodeMock').install();
 *   const DataService = require('../../src/services/dataService');
 */

const Module = require('module');
const path = require('path');

// Shape mínimo que dataService.js usa.
// Position/Range/Selection foram acrescentados para coderService.js, que
// converte ranges LSP em offsets do documento.
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}

// Location é o que `stream.anchor()` recebe para apontar a uma linha de um
// arquivo — a âncora do chat até o `.syn` (Etapa G).
class Location {
    constructor(uri, rangeOrPosition) {
        this.uri = uri;
        this.range = rangeOrPosition;
    }
}

// Partes do Language Model API, usadas pelo chat (`src/chat/`). São classes
// reais e não objetos simples porque o código de produção decide o tipo com
// `instanceof` — um stub de objeto passaria pelos testes e falharia em runtime.
class LanguageModelTextPart {
    constructor(value) {
        this.value = value;
    }
}

class LanguageModelToolCallPart {
    constructor(callId, name, input) {
        this.callId = callId;
        this.name = name;
        this.input = input;
    }
}

class LanguageModelToolResultPart {
    constructor(callId, content) {
        this.callId = callId;
        this.content = content;
    }
}

const stub = {
    Uri: {
        parse: (uri) => ({ fsPath: uri.replace(/^file:\/\//, '') }),
        file: (fsPath) => ({ fsPath, scheme: 'file' })
    },
    Position,
    Range,
    Location,
    Selection: class Selection extends Range {},
    window: {
        activeTextEditor: null,
        showWarningMessage: () => {}
    },
    workspace: {
        workspaceFolders: null,
        getWorkspaceFolder: () => null
    },
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    // `tools` e `invokeTool` são substituídos pelo teste que precisa deles;
    // o padrão é "nenhuma ferramenta disponível", que é o caminho de
    // degradação que o chat tem de suportar de qualquer forma.
    lm: {
        tools: [],
        invokeTool: async () => ({ content: [] })
    },
    commands: {
        executeCommand: async () => undefined
    }
};

let installed = false;

function install() {
    if (installed) return;
    installed = true;

    // Injeta o stub no cache de require com o nome que os módulos usam
    const fakeId = 'vscode';
    Module._resolveFilename = (function (original) {
        return function (request, parent, isMain, options) {
            if (request === fakeId) return fakeId;
            return original.call(this, request, parent, isMain, options);
        };
    }(Module._resolveFilename));

    require.cache[fakeId] = {
        id: fakeId,
        filename: fakeId,
        loaded: true,
        exports: stub
    };
}

function uninstall() {
    if (!installed) return;
    delete require.cache['vscode'];
    installed = false;
}

module.exports = { stub, install, uninstall };
