/**
 * codeExplorer.js - TreeDataProvider para navegacao de codigos
 *
 * Proposito:
 *     Lista codigos encontrados em fields CODE e CHAIN.
 *     Agrupa ocorrencias por codigo e permite navegacao.
 *
 * Componentes principais:
 *     - refresh: Escaneia workspace e atualiza o indice
 *     - getChildren: Retorna lista de codigos ou ocorrencias
 *
 * Dependencias criticas:
 *     - TemplateManager: carregamento do template
 *     - SynesisParser: parse de ITEMs
 *     - chainParser: extracao de codigos em chains
 */

const vscode = require('vscode');
const SynesisParser = require('../../parsers/synesisParser');
const FieldRegistry = require('../../core/fieldRegistry');
const chainParser = require('../../parsers/chainParser');
const positionUtils = require('../../utils/positionUtils');

class CodeExplorer {
    constructor(workspaceScanner, templateManager) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.parser = new SynesisParser();
        this.codes = new Map(); // code -> [occurrences]
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Escaneia workspace e atualiza indice de codigos
     */
    async refresh() {
        this.codes.clear();

        try {
            const projectUri = await this.scanner.findProjectFile();
            const registry = await this.templateManager.loadTemplate(projectUri);
            const fieldRegistry = new FieldRegistry(registry);
            const codeFields = fieldRegistry.getCodeFields();
            const chainFields = fieldRegistry.getChainFields();
            const synFiles = await this.scanner.findSynFiles();

            for (const fileUri of synFiles) {
                await this._scanFile(fileUri, codeFields, chainFields, registry);
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning codes:', error);
            vscode.window.showErrorMessage(`Failed to scan codes: ${error.message}`);
        }
    }

    /**
     * Escaneia um arquivo .syn individual
     * @private
     */
    async _scanFile(fileUri, codeFields, chainFields, registry) {
        const content = await vscode.workspace.fs.readFile(fileUri);
        const text = content.toString();
        const filePath = fileUri.fsPath;
        const lineOffsets = positionUtils.buildLineOffsets(text);

        const items = this.parser.parseItems(text, filePath);

        for (const item of items) {
            for (const fieldName of codeFields) {
                if (item.fields[fieldName]) {
                    const codes = this._extractCodes(item.fields[fieldName]);
                    for (const code of codes) {
                        const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
                        const line = position ? position.line : item.line;
                        const column = position ? position.column : 0;
                        this._addCodes([code], filePath, line, column, 'code', fieldName);
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
                        this._addCodes([code], filePath, line, column, 'chain', fieldName);
                    }
                }
            }
        }
    }

    /**
     * Extrai codigos de um campo CODE
     * @private
     */
    _extractCodes(value) {
        return value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    /**
     * Registra ocorrencias para cada codigo
     * @private
     */
    _addCodes(codes, filePath, line, column, context, fieldName) {
        for (const code of codes) {
            if (!this.codes.has(code)) {
                this.codes.set(code, []);
            }

            this.codes.get(code).push({
                file: filePath,
                line,
                column,
                context,
                field: fieldName
            });
        }
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const items = [];
            const filter = this.filterText;

            for (const [code, occurrences] of this.codes.entries()) {
                if (filter && !code.toLowerCase().includes(filter)) {
                    continue;
                }
                items.push(new CodeTreeItem(code, occurrences));
            }

            return items.sort((a, b) => a.code.localeCompare(b.code));
        }

        return element.occurrences.map(occ => new OccurrenceTreeItem(occ));
    }

    /**
     * Atualiza o filtro por codigo
     * @param {string} text
     */
    setFilter(text) {
        this.filterText = (text || '').trim().toLowerCase();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Retorna o filtro atual
     * @returns {string}
     */
    getFilter() {
        return this.filterText;
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
}

class CodeTreeItem extends vscode.TreeItem {
    constructor(code, occurrences) {
        super(code, vscode.TreeItemCollapsibleState.Collapsed);

        this.code = code;
        this.occurrences = occurrences;
        this.description = `${occurrences.length} occurrence(s)`;
        this.iconPath = new vscode.ThemeIcon('symbol-key');
        this.contextValue = 'code';
    }
}

class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        const fileName = occurrence.file.substring(occurrence.file.lastIndexOf('/') + 1);
        const label = `${fileName}:${occurrence.line}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = `${occurrence.context} (${occurrence.field})`;
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = occurrence.file;
        this.contextValue = 'codeOccurrence';
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [occurrence.file, occurrence.line, occurrence.column]
        };
    }
}

module.exports = CodeExplorer;
