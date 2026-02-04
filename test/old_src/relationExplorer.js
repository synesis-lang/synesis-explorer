/**
 * relationExplorer.js - TreeDataProvider para navegacao de relacoes
 *
 * Proposito:
 *     Lista relacoes extraidas de campos CHAIN em itens Synesis.
 *     Agrupa por tipo de relacao e permite navegacao para a origem.
 *
 * Componentes principais:
 *     - refresh: Escaneia workspace e atualiza o indice
 *     - getChildren: Retorna relacoes ou triplets
 *
 * Dependencias criticas:
 *     - TemplateManager: carregamento do template
 *     - SynesisParser: parse de ITEMs
 *     - chainParser: extracao de codigos e relacoes
 */

const vscode = require('vscode');
const SynesisParser = require('../../parsers/synesisParser');
const FieldRegistry = require('../../core/fieldRegistry');
const chainParser = require('../../parsers/chainParser');
const positionUtils = require('../../utils/positionUtils');

class RelationExplorer {
    constructor(workspaceScanner, templateManager) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.parser = new SynesisParser();
        this.relations = new Map(); // relation -> [triplets]
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Escaneia workspace e atualiza indice de relacoes
     */
    async refresh() {
        this.relations.clear();

        try {
            const projectUri = await this.scanner.findProjectFile();
            if (!projectUri) {
                await this._setHasChains(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const registry = await this.templateManager.loadTemplate(projectUri);
            const info = this.templateManager.getTemplateInfo(projectUri);
            const fieldRegistry = new FieldRegistry(registry);
            const chainFields = fieldRegistry.getChainFields();
            const hasChains = Boolean(info && info.fromTemplate && info.hasChainFields && chainFields.length > 0);

            await this._setHasChains(hasChains);
            if (!hasChains) {
                this._onDidChangeTreeData.fire();
                return;
            }

            const synFiles = await this.scanner.findSynFiles();

            for (const fileUri of synFiles) {
                await this._scanFile(fileUri, chainFields, registry);
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning relations:', error);
            await this._setHasChains(false);
            vscode.window.showErrorMessage(`Failed to scan relations: ${error.message}`);
        }
    }

    /**
     * Escaneia um arquivo .syn individual
     * @private
     */
    async _scanFile(fileUri, chainFields, registry) {
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

                    if (!this.relations.has(relation)) {
                        this.relations.set(relation, []);
                    }

                    this.relations.get(relation).push({
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
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const items = [];
            const filter = this.filterText;
            for (const [relation, triplets] of this.relations.entries()) {
                if (filter && !relation.toLowerCase().includes(filter)) {
                    continue;
                }
                items.push(new RelationTreeItem(relation, triplets));
            }
            return items.sort((a, b) => a.relation.localeCompare(b.relation));
        }

        return element.triplets.map(triplet => new TripletTreeItem(triplet));
    }

    async _setHasChains(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.hasChains', value);
    }

    /**
     * Atualiza o filtro por relacao
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

class RelationTreeItem extends vscode.TreeItem {
    constructor(relation, triplets) {
        super(relation, vscode.TreeItemCollapsibleState.Collapsed);

        this.relation = relation;
        this.triplets = triplets;
        this.description = `${triplets.length} triplet(s)`;
        this.iconPath = new vscode.ThemeIcon('link');
        this.contextValue = 'relation';
    }
}

class TripletTreeItem extends vscode.TreeItem {
    constructor(triplet) {
        const label = `${triplet.from} -> ${triplet.to}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = triplet.type;
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = triplet.file;
        this.contextValue = 'relationTriplet';
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [triplet.file, triplet.line, triplet.column]
        };
    }
}

module.exports = RelationExplorer;
