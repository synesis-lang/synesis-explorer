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
 *     - DataService: LSP-only data access
 */

const vscode = require('vscode');

class RelationExplorer {
    constructor(dataService) {
        this.dataService = dataService;
        this.relations = new Map(); // relation -> [triplets]
        this.filterText = '';
        this.placeholder = null;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Obtém relações via DataService e atualiza índice
     */
    async refresh() {
        this.relations.clear();
        this.placeholder = null;

        const lspStatus = this._getLspStatus();
        if (lspStatus !== 'ready') {
            const label = lspStatus === 'disabled' ? 'LSP disabled' : 'LSP not ready';
            const description = lspStatus === 'disabled'
                ? 'Synesis LSP is disabled in settings.'
                : 'Waiting for Synesis LSP to initialize...';
            this._setPlaceholder(label, description);
            await this._setHasChains(false);
            this._onDidChangeTreeData.fire();
            return;
        }

        try {
            const relations = await this.dataService.getRelations();
            console.log('RelationExplorer.refresh: received', relations ? relations.length : 0, 'relation types');

            if (relations && relations.length > 0) {
                const firstRelation = relations[0];
                console.log('RelationExplorer.refresh: First relation:', firstRelation.relation);
                console.log('RelationExplorer.refresh: First relation triplets:', firstRelation.triplets.length);
                if (firstRelation.triplets.length > 0) {
                    const firstTriplet = firstRelation.triplets[0];
                    console.log('RelationExplorer.refresh: First triplet file:', firstTriplet.file);
                    console.log('RelationExplorer.refresh: First triplet line:', firstTriplet.line);
                    console.log('RelationExplorer.refresh: First triplet:', `${firstTriplet.from} -> ${firstTriplet.to}`);
                }
            }

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
            if (this.placeholder) {
                return [this.placeholder];
            }

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

        if (element.isPlaceholder) {
            return [];
        }

        return element.triplets.map(triplet => new TripletTreeItem(triplet));
    }

    async _setHasChains(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.hasChains', value);
    }

    _getLspStatus() {
        const client = this.dataService && this.dataService.lspClient;
        if (!client) {
            return 'disabled';
        }
        if (typeof client.isReady !== 'function' || !client.isReady()) {
            return 'loading';
        }
        return 'ready';
    }

    _setPlaceholder(label, description) {
        this.placeholder = new StatusTreeItem(label, description);
    }

    /**
     * Atualiza o filtro por relacao
     * @param {string} text
     */
    setFilter(text) {
        this.filterText = (text || '').trim().toLowerCase();
        this._setFilterActive(this.filterText.length > 0);
        this._onDidChangeTreeData.fire();
    }

    /**
     * Retorna o filtro atual
     * @returns {string}
     */
    getFilter() {
        return this.filterText;
    }

    async _setFilterActive(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.relation.filterActive', value);
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

        // Validar se file existe
        if (!triplet.file) {
            console.warn('TripletTreeItem: triplet.file is null or undefined', triplet);
            this.description = `${triplet.type} (no location)`;
        } else {
            this.description = triplet.type;
        }

        this.iconPath = new vscode.ThemeIcon(triplet.file ? 'file' : 'question');
        this.tooltip = triplet.file || '<location not available>';
        this.contextValue = 'relationTriplet';

        // Só adicionar comando se file existir
        if (triplet.file) {
            this.command = {
                command: 'synesis.openLocation',
                title: 'Open Location',
                arguments: [triplet.file, triplet.line, triplet.column]
            };
        }
    }
}

class StatusTreeItem extends vscode.TreeItem {
    constructor(label, description) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description || '';
        this.tooltip = description || '';
        this.iconPath = new vscode.ThemeIcon('sync');
        this.contextValue = 'status';
        this.isPlaceholder = true;
    }
}

module.exports = RelationExplorer;
