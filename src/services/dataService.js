/**
 * dataService.js - Adapter Pattern para dados LSP vs Regex local
 *
 * Proposito:
 *     Abstrai a fonte de dados (LSP server ou parsers regex locais)
 *     para que explorers e viewers consumam uma interface unica.
 *
 * Componentes:
 *     - LspDataProvider: envia requests ao LSP e normaliza respostas
 *     - LocalRegexProvider: encapsula logica de parsing dos explorers
 *     - DataService: orquestrador com fallback silencioso
 *
 * Shapes normalizados:
 *     - getReferences() -> Array<{ bibref, itemCount, occurrences }>
 *     - getCodes() -> Array<{ code, usageCount, ontologyDefined, occurrences }>
 *     - getRelations() -> Array<{ relation, triplets }>
 *     - getRelationGraph(bibref?) -> { mermaidCode } | null
 */

const path = require('path');
const vscode = require('vscode');
const SynesisParser = require('../parsers/synesisParser');
const FieldRegistry = require('../core/fieldRegistry');
const chainParser = require('../parsers/chainParser');
const positionUtils = require('../utils/positionUtils');
const { generateMermaidGraph } = require('../utils/mermaidUtils');

// ---------------------------------------------------------------------------
// LspDataProvider
// ---------------------------------------------------------------------------

class LspDataProvider {
    constructor(lspClient) {
        this.lspClient = lspClient;
    }

    _isMethodNotFound(error) {
        return Boolean(error && (error.code === -32601 || /Method Not Found/i.test(error.message)));
    }

    async _sendRequestWithFallback(primaryMethod, params, fallbackMethods = []) {
        try {
            return await this.lspClient.sendRequest(primaryMethod, params);
        } catch (error) {
            if (!this._isMethodNotFound(error) || fallbackMethods.length === 0) {
                throw error;
            }

            for (const method of fallbackMethods) {
                try {
                    return await this.lspClient.sendRequest(method, params);
                } catch (fallbackError) {
                    if (!this._isMethodNotFound(fallbackError)) {
                        throw fallbackError;
                    }
                }
            }

            throw error;
        }
    }

    async getReferences(workspaceRoot) {
        const result = await this._sendRequestWithFallback(
            'synesis/getReferences',
            { workspaceRoot },
            ['synesis/get_references']
        );
        if (!result || !result.success) {
            return null;
        }

        const grouped = new Map();
        for (const ref of (result.references || [])) {
            if (!grouped.has(ref.bibref)) {
                grouped.set(ref.bibref, { bibref: ref.bibref, itemCount: 0, occurrences: [] });
            }
            const entry = grouped.get(ref.bibref);
            entry.itemCount += ref.itemCount || 0;
            if (ref.location) {
                entry.occurrences.push({
                    file: path.resolve(workspaceRoot, ref.location.file),
                    line: ref.location.line - 1,
                    itemCount: ref.itemCount || 0
                });
            }
        }
        return Array.from(grouped.values());
    }

    async getCodes(workspaceRoot) {
        const result = await this._sendRequestWithFallback(
            'synesis/getCodes',
            { workspaceRoot },
            ['synesis/get_codes']
        );
        if (!result || !result.success) {
            return null;
        }

        return (result.codes || []).map(c => ({
            code: c.code,
            usageCount: c.usageCount || 0,
            ontologyDefined: c.ontologyDefined || false,
            occurrences: []
        }));
    }

    async getRelations(workspaceRoot) {
        const result = await this._sendRequestWithFallback(
            'synesis/getRelations',
            { workspaceRoot },
            ['synesis/get_relations']
        );
        if (!result || !result.success) {
            return null;
        }

        const grouped = new Map();
        for (const rel of (result.relations || [])) {
            if (!grouped.has(rel.relation)) {
                grouped.set(rel.relation, { relation: rel.relation, triplets: [] });
            }
            grouped.get(rel.relation).triplets.push({
                from: rel.from,
                to: rel.to,
                file: null,
                line: -1,
                column: -1,
                type: ''
            });
        }
        return Array.from(grouped.values());
    }

    async getRelationGraph(workspaceRoot, bibref) {
        const params = { workspaceRoot };
        if (bibref) {
            params.bibref = bibref;
        }
        const result = await this._sendRequestWithFallback(
            'synesis/getRelationGraph',
            params,
            ['synesis/get_relation_graph']
        );
        if (!result || !result.success) {
            return null;
        }
        return { mermaidCode: result.mermaidCode };
    }
}

// ---------------------------------------------------------------------------
// LocalRegexProvider
// ---------------------------------------------------------------------------

class LocalRegexProvider {
    constructor(workspaceScanner, templateManager) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.parser = new SynesisParser();
    }

    async getReferences() {
        const refs = new Map();
        const projectUri = await this.scanner.findProjectFile();
        const synFiles = await this.scanner.findSynFiles(projectUri);

        for (const fileUri of synFiles) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                const text = content.toString();
                const filePath = fileUri.fsPath;
                const sources = this.parser.parseSourceBlocks(text, filePath);

                for (const source of sources) {
                    const itemCount = this.parser.countItemsInSource(text, source.bibref);
                    if (!refs.has(source.bibref)) {
                        refs.set(source.bibref, { bibref: source.bibref, itemCount: 0, occurrences: [] });
                    }
                    const entry = refs.get(source.bibref);
                    entry.itemCount += itemCount;
                    entry.occurrences.push({
                        file: filePath,
                        line: source.line,
                        itemCount
                    });
                }
            } catch (error) {
                console.error(`LocalRegexProvider.getReferences: error scanning ${fileUri.fsPath}:`, error);
            }
        }

        return Array.from(refs.values());
    }

    async getCodes() {
        const codes = new Map();
        const projectUri = await this.scanner.findProjectFile();
        const registry = await this.templateManager.loadTemplate(projectUri);
        const fieldRegistry = new FieldRegistry(registry);
        const codeFields = fieldRegistry.getCodeFields();
        const chainFields = fieldRegistry.getChainFields();
        const synFiles = await this.scanner.findSynFiles(projectUri);

        for (const fileUri of synFiles) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                const text = content.toString();
                const filePath = fileUri.fsPath;
                const lineOffsets = positionUtils.buildLineOffsets(text);
                const items = this.parser.parseItems(text, filePath);

                for (const item of items) {
                    for (const fieldName of codeFields) {
                        if (item.fields[fieldName]) {
                            const extracted = this._extractCodes(item.fields[fieldName]);
                            for (const code of extracted) {
                                const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
                                const line = position ? position.line : item.line;
                                const column = position ? position.column : 0;
                                this._addCodeOccurrence(codes, code, filePath, line, column, 'code', fieldName);
                            }
                        }
                    }

                    for (const fieldName of chainFields) {
                        if (item.fields[fieldName]) {
                            const fieldDef = registry[fieldName] || {};
                            const parsed = chainParser.parseChain(item.fields[fieldName], fieldDef);
                            for (const code of parsed.codes) {
                                const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
                                const line = position ? position.line : item.line;
                                const column = position ? position.column : 0;
                                this._addCodeOccurrence(codes, code, filePath, line, column, 'chain', fieldName);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`LocalRegexProvider.getCodes: error scanning ${fileUri.fsPath}:`, error);
            }
        }

        return Array.from(codes.entries()).map(([code, occurrences]) => ({
            code,
            usageCount: occurrences.length,
            ontologyDefined: false,
            occurrences
        }));
    }

    async getRelations() {
        const relations = new Map();
        const projectUri = await this.scanner.findProjectFile();
        if (!projectUri) {
            return [];
        }

        const registry = await this.templateManager.loadTemplate(projectUri);
        const fieldRegistry = new FieldRegistry(registry);
        const chainFields = fieldRegistry.getChainFields();

        if (chainFields.length === 0) {
            return [];
        }

        const synFiles = await this.scanner.findSynFiles(projectUri);

        for (const fileUri of synFiles) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                const text = content.toString();
                const filePath = fileUri.fsPath;
                const lineOffsets = positionUtils.buildLineOffsets(text);
                const items = this.parser.parseItems(text, filePath);

                for (const item of items) {
                    for (const fieldName of chainFields) {
                        if (!item.fields[fieldName]) {
                            continue;
                        }

                        const fieldDef = registry[fieldName] || {};
                        const parsed = chainParser.parseChain(item.fields[fieldName], fieldDef);

                        for (let index = 0; index < parsed.relations.length; index += 1) {
                            const relation = parsed.relations[index];
                            const from = parsed.codes[index];
                            const to = parsed.codes[index + 1];
                            const position = this._findTokenPosition(item, fieldName, relation, lineOffsets);
                            const line = position ? position.line : item.line;
                            const column = position ? position.column : 0;

                            if (!relations.has(relation)) {
                                relations.set(relation, { relation, triplets: [] });
                            }
                            relations.get(relation).triplets.push({
                                from,
                                to,
                                file: filePath,
                                line,
                                column,
                                type: parsed.type
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`LocalRegexProvider.getRelations: error scanning ${fileUri.fsPath}:`, error);
            }
        }

        return Array.from(relations.values());
    }

    async getRelationGraph(_workspaceRoot, bibref) {
        if (!bibref) {
            return null;
        }

        const projectUri = await this.scanner.findProjectFile();
        if (!projectUri) {
            return null;
        }

        const registry = await this.templateManager.loadTemplate(projectUri);
        const info = this.templateManager.getTemplateInfo(projectUri);
        const fieldRegistry = new FieldRegistry(registry);
        const chainFields = fieldRegistry.getChainFields();
        const hasChains = Boolean(info && info.fromTemplate && info.hasChainFields && chainFields.length > 0);

        if (!hasChains) {
            return null;
        }

        const relations = [];
        const synFiles = await this.scanner.findSynFiles(projectUri);

        for (const fileUri of synFiles) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                const text = content.toString();
                const filePath = fileUri.fsPath;
                const items = this.parser.parseItems(text, filePath);
                const filtered = items.filter(item => item.bibref === bibref);

                for (const item of filtered) {
                    for (const fieldName of chainFields) {
                        const chainValues = this._getChainValues(item, fieldName);
                        if (chainValues.length === 0) {
                            continue;
                        }

                        const fieldDef = registry[fieldName] || {};
                        const chainTexts = chainValues.flatMap(value => this._splitChainValues(value));

                        for (const chainText of chainTexts) {
                            const parsed = chainParser.parseChain(chainText, fieldDef);
                            for (let index = 0; index < parsed.relations.length; index += 1) {
                                relations.push({
                                    from: parsed.codes[index],
                                    to: parsed.codes[index + 1],
                                    label: parsed.relations[index] || ''
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`LocalRegexProvider.getRelationGraph: error scanning ${fileUri.fsPath}:`, error);
            }
        }

        const mermaidCode = generateMermaidGraph(bibref, relations);
        if (!mermaidCode) {
            return null;
        }

        return { mermaidCode };
    }

    // -- Private helpers (extracted from CodeExplorer / RelationExplorer) --

    _extractCodes(value) {
        return value.split(',').map(item => item.trim()).filter(Boolean);
    }

    _addCodeOccurrence(codes, code, filePath, line, column, context, fieldName) {
        if (!codes.has(code)) {
            codes.set(code, []);
        }
        codes.get(code).push({ file: filePath, line, column, context, field: fieldName });
    }

    _findTokenPosition(item, fieldName, token, lineOffsets) {
        if (!item.blockContent || typeof item.blockOffset !== 'number') {
            return null;
        }

        const fieldInfo = this._findFieldValueInfo(item.blockContent, fieldName);
        if (!fieldInfo) {
            return null;
        }

        const tokenOffset = this._findTokenOffset(fieldInfo.value, token);
        if (tokenOffset === null) {
            return null;
        }

        const absoluteOffset = item.blockOffset + fieldInfo.valueStart + tokenOffset;
        return positionUtils.getLineColumn(lineOffsets, absoluteOffset);
    }

    _findFieldValueInfo(blockContent, fieldName) {
        const escapedName = this._escapeRegex(fieldName);
        const pattern = new RegExp(
            `^\\s*${escapedName}\\s*:\\s*([\\s\\S]*?)(?=^\\s*[\\p{L}\\p{N}._-]+\\s*:|\\s*(?![\\s\\S]))`,
            'gmu'
        );

        const match = pattern.exec(blockContent);
        if (!match) {
            return null;
        }

        const value = match[1];
        const valueStart = match.index + match[0].length - value.length;
        return { value, valueStart };
    }

    _findTokenOffset(value, token) {
        const escaped = this._escapeRegex(token);
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}._-])(${escaped})(?=$|[^\\p{L}\\p{N}._-])`, 'u');
        const match = pattern.exec(value);
        if (!match) {
            return null;
        }
        return match.index + match[1].length;
    }

    _escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // -- Graph helpers (extracted from GraphViewer) --

    _getChainValues(item, fieldName) {
        if (!item || !fieldName) {
            return [];
        }

        const values = this._extractFieldValues(item.blockContent, fieldName);
        if (values.length > 0) {
            return values;
        }

        if (item.fields && item.fields[fieldName]) {
            return [item.fields[fieldName]];
        }

        return [];
    }

    _extractFieldValues(blockContent, fieldName) {
        if (!blockContent) {
            return [];
        }

        const values = [];
        const lines = blockContent.split('\n');
        let currentField = null;
        let currentValue = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const fieldMatch = trimmed.match(/^([\p{L}\p{N}._-]+)\s*:\s*(.*)$/u);
            if (fieldMatch) {
                if (currentField === fieldName) {
                    values.push(currentValue.join('\n').trim());
                }
                currentField = fieldMatch[1];
                currentValue = [fieldMatch[2]];
                continue;
            }

            if (currentField === fieldName) {
                currentValue.push(trimmed);
            }
        }

        if (currentField === fieldName) {
            values.push(currentValue.join('\n').trim());
        }

        return values.filter(Boolean);
    }

    _splitChainValues(value) {
        const rawLines = String(value || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        if (rawLines.length <= 1) {
            return rawLines;
        }

        const hasContinuation = rawLines.some(line => line.endsWith('->') || line.startsWith('->'));
        if (hasContinuation) {
            return [rawLines.join(' ')];
        }

        return rawLines;
    }
}

// ---------------------------------------------------------------------------
// DataService (orchestrator)
// ---------------------------------------------------------------------------

class DataService {
    constructor({ lspClient, workspaceScanner, templateManager, onLspIncompatible }) {
        this.lspClient = lspClient || null;
        this.lspProvider = lspClient ? new LspDataProvider(lspClient) : null;
        this.localProvider = new LocalRegexProvider(workspaceScanner, templateManager);
        this.unsupportedMethods = new Set();
        this.warnedUnsupported = false;
        this.onLspIncompatible = typeof onLspIncompatible === 'function' ? onLspIncompatible : null;
        this._lspNullCount = 0;
        this._lspNullWarned = false;
    }

    async getReferences() {
        return this._tryLspThenLocal('getReferences');
    }

    async getCodes() {
        return this._tryLspThenLocal('getCodes');
    }

    async getRelations() {
        return this._tryLspThenLocal('getRelations');
    }

    async getRelationGraph(bibref) {
        return this._tryLspThenLocal('getRelationGraph', bibref);
    }

    async _tryLspThenLocal(method, ...args) {
        if (this.lspClient && this.lspClient.isReady() && !this.unsupportedMethods.has(method)) {
            try {
                const workspaceRoot = this._getWorkspaceRoot();
                const result = await this.lspProvider[method](workspaceRoot, ...args);
                if (result !== null) {
                    return result;
                }
                console.warn(`DataService: LSP ${method} returned null, falling back to local`);
                this._trackLspNull();
            } catch (error) {
                if (this._isMethodNotFound(error)) {
                    this.unsupportedMethods.add(method);
                    this._warnUnsupported(method, error);
                }
                console.warn(`DataService: LSP ${method} failed, falling back to local:`, error.message);
            }
        }
        return this.localProvider[method](...args);
    }

    _trackLspNull() {
        if (this._lspNullWarned) {
            return;
        }
        this._lspNullCount += 1;
        if (this._lspNullCount >= 3 && this.onLspIncompatible) {
            this._lspNullWarned = true;
            this.onLspIncompatible();
        }
    }

    _isMethodNotFound(error) {
        return Boolean(error && (error.code === -32601 || /Method Not Found/i.test(error.message)));
    }

    _warnUnsupported(method, error) {
        if (this.warnedUnsupported) {
            return;
        }

        this.warnedUnsupported = true;
        if (this.onLspIncompatible) {
            this.onLspIncompatible();
        }
        const lspMethod = this._resolveLspMethodName(method);
        const message = `Synesis LSP does not support "${lspMethod}". ` +
            'Using local parsers instead. Update synesis-lsp to v1.0.0+ ' +
            'or adjust synesisExplorer.lsp.pythonPath.';

        vscode.window.showWarningMessage(message);
        console.warn(`DataService: LSP method not found (${lspMethod}):`, error.message);
    }

    _resolveLspMethodName(method) {
        switch (method) {
            case 'getReferences':
                return 'synesis/getReferences';
            case 'getCodes':
                return 'synesis/getCodes';
            case 'getRelations':
                return 'synesis/getRelations';
            case 'getRelationGraph':
                return 'synesis/getRelationGraph';
            default:
                return method;
        }
    }

    _getWorkspaceRoot() {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document && editor.document.uri) {
            const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            if (folder && folder.uri && folder.uri.fsPath) {
                return folder.uri.fsPath;
            }
        }

        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : '';
    }
}

module.exports = DataService;
