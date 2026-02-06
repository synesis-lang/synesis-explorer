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
 *     - DataService: LSP-only data access
 */

const path = require('path');
const vscode = require('vscode');

class CodeExplorer {
    constructor(dataService) {
        this.dataService = dataService;
        this.codes = new Map(); // code -> { usageCount, ontologyDefined, occurrences }
        this.filterText = '';
        this.placeholder = null;
        this._lastDataHash = null; // Cache hash to avoid unnecessary refreshes

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Simple hash function for cache comparison
     */
    _hashData(codes) {
        if (!codes || codes.length === 0) {
            return 'empty';
        }
        const parts = codes.map(codeEntry => {
            const code = String(codeEntry.code || '');
            const occCount = Array.isArray(codeEntry.occurrences) ? codeEntry.occurrences.length : 0;
            const usageCount = typeof codeEntry.usageCount === 'number' ? codeEntry.usageCount : occCount;
            return `${code}:${usageCount}:${occCount}`;
        });
        parts.sort();
        return parts.join('|');
    }

    /**
     * Obtém códigos via DataService e atualiza índice
     */
    async refresh() {
        this.placeholder = null;

        const lspStatus = this._getLspStatus();
        if (lspStatus !== 'ready') {
            const label = lspStatus === 'disabled' ? 'LSP disabled' : 'LSP not ready';
            const description = lspStatus === 'disabled'
                ? 'Synesis LSP is disabled in settings.'
                : 'Waiting for Synesis LSP to initialize...';
            this._setPlaceholder(label, description);
            await this._setHasCodes(false);
            this._onDidChangeTreeData.fire();
            return;
        }

        try {
            const codes = await this.dataService.getCodes();

            // Check if data actually changed
            const newHash = this._hashData(codes);
            if (newHash === this._lastDataHash) {
                // Data hasn't changed, skip update
                return;
            }
            this._lastDataHash = newHash;

            this.codes.clear();
            for (const entry of codes) {
                this.codes.set(entry.code, {
                    usageCount: entry.usageCount,
                    ontologyDefined: entry.ontologyDefined,
                    occurrences: entry.occurrences
                });
            }

            await this._setHasCodes(this.codes.size > 0);
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('CodeExplorer: Error scanning codes:', error);
            await this._setHasCodes(false);
            vscode.window.showErrorMessage(`Failed to scan codes: ${error.message}`);
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

            for (const [code, data] of this.codes.entries()) {
                if (filter && !code.toLowerCase().includes(filter)) {
                    continue;
                }
                items.push(new CodeTreeItem(code, data));
            }

            return items.sort((a, b) => a.code.localeCompare(b.code));
        }

        if (element.isPlaceholder) {
            return [];
        }

        return element.occurrences.map(occ => new OccurrenceTreeItem(occ));
    }

    async _setHasCodes(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.hasCodes', value);
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
     * Atualiza o filtro por codigo
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
        await vscode.commands.executeCommand('setContext', 'synesis.code.filterActive', value);
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
        const occurrenceCount = Array.isArray(data.occurrences) ? data.occurrences.length : 0;
        this.description = `${occurrenceCount} occurrence(s)`;
        this.iconPath = new vscode.ThemeIcon(data.ontologyDefined ? 'symbol-key' : 'symbol-variable');
        this.contextValue = 'code';
    }
}

class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        const fileName = occurrence.file ? path.basename(occurrence.file) : '<unknown file>';
        const lineLabel = typeof occurrence.line === 'number' && occurrence.line >= 0
            ? occurrence.line + 1
            : '?';
        const label = `${fileName}:${lineLabel}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = `${occurrence.context} (${occurrence.field})`;
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = occurrence.file || '<file not available>';
        this.contextValue = 'codeOccurrence';

        // Só adicionar comando se file existir
        if (occurrence.file) {
            this.command = {
                command: 'synesis.openLocation',
                title: 'Open Location',
                arguments: [occurrence.file, occurrence.line, occurrence.column]
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

module.exports = CodeExplorer;
