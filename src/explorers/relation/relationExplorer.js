/**
 * relationExplorer.js - TreeDataProvider para navegacao de relacoes
 *
 * Proposito:
 *     Lista relacoes extraidas de campos CHAIN em itens Synesis.
 *     Agrupa por tipo de relacao e permite navegacao para a origem.
 *
 * Componentes principais:
 *     - refresh: Obtém dados via DataService (LSP ou regex local)
 *     - getChildren: Retorna relacoes ou triplets
 *
 * Dependencias criticas:
 *     - DataService: Adapter LSP/local para dados normalizados
 */

const vscode = require('vscode');

class RelationExplorer {
    constructor(dataService) {
        this.dataService = dataService;
        this.relations = new Map(); // relation -> [triplets]
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Obtém relações via DataService e atualiza índice
     */
    async refresh() {
        this.relations.clear();

        try {
            const relations = await this.dataService.getRelations();

            for (const entry of relations) {
                this.relations.set(entry.relation, entry.triplets);
            }

            await this._setHasChains(this.relations.size > 0);
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning relations:', error);
            await this._setHasChains(false);
            vscode.window.showErrorMessage(`Failed to scan relations: ${error.message}`);
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
        this.tooltip = triplet.file || '';
        this.contextValue = 'relationTriplet';

        if (triplet.file) {
            this.command = {
                command: 'synesis.openLocation',
                title: 'Open Location',
                arguments: [triplet.file, triplet.line, triplet.column]
            };
        }
    }
}

module.exports = RelationExplorer;
