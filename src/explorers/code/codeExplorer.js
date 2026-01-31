/**
 * codeExplorer.js - TreeDataProvider para navegacao de codigos
 *
 * Proposito:
 *     Lista codigos encontrados em fields CODE e CHAIN.
 *     Agrupa ocorrencias por codigo e permite navegacao.
 *
 * Componentes principais:
 *     - refresh: Obtém dados via DataService (LSP ou regex local)
 *     - getChildren: Retorna lista de codigos ou ocorrencias
 *
 * Dependencias criticas:
 *     - DataService: Adapter LSP/local para dados normalizados
 */

const vscode = require('vscode');

class CodeExplorer {
    constructor(dataService) {
        this.dataService = dataService;
        this.codes = new Map(); // code -> { usageCount, ontologyDefined, occurrences }
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Obtém códigos via DataService e atualiza índice
     */
    async refresh() {
        this.codes.clear();

        try {
            const codes = await this.dataService.getCodes();

            for (const entry of codes) {
                this.codes.set(entry.code, {
                    usageCount: entry.usageCount,
                    ontologyDefined: entry.ontologyDefined,
                    occurrences: entry.occurrences
                });
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning codes:', error);
            vscode.window.showErrorMessage(`Failed to scan codes: ${error.message}`);
        }
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const items = [];
            const filter = this.filterText;

            for (const [code, data] of this.codes.entries()) {
                if (filter && !code.toLowerCase().includes(filter)) {
                    continue;
                }
                items.push(new CodeTreeItem(code, data));
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
}

class CodeTreeItem extends vscode.TreeItem {
    constructor(code, data) {
        const hasChildren = data.occurrences.length > 0;
        const state = hasChildren
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        super(code, state);

        this.code = code;
        this.occurrences = data.occurrences;
        this.description = `${data.usageCount} occurrence(s)`;
        this.iconPath = new vscode.ThemeIcon(data.ontologyDefined ? 'symbol-key' : 'symbol-variable');
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
