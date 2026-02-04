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

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Obtém códigos via DataService e atualiza índice
     */
    async refresh() {
        this.codes.clear();
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
            console.log('CodeExplorer.refresh: received', codes ? codes.length : 0, 'codes');

            if (codes && codes.length > 0) {
                const firstCode = codes[0];
                console.log('CodeExplorer.refresh: First code:', firstCode.code);
                console.log('CodeExplorer.refresh: First code occurrences:', firstCode.occurrences.length);
                if (firstCode.occurrences.length > 0) {
                    const firstOcc = firstCode.occurrences[0];
                    console.log('CodeExplorer.refresh: First occurrence file:', firstOcc.file);
                    console.log('CodeExplorer.refresh: First occurrence line:', firstOcc.line);
                    console.log('CodeExplorer.refresh: First occurrence column:', firstOcc.column);
                }
            }

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
            console.error('Error scanning codes:', error);
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
        this.description = `${data.usageCount} occurrence(s)`;
        this.iconPath = new vscode.ThemeIcon(data.ontologyDefined ? 'symbol-key' : 'symbol-variable');
        this.contextValue = 'code';
    }
}

class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        // Validar se file existe
        if (!occurrence.file) {
            console.warn('OccurrenceTreeItem: occurrence.file is null or undefined', occurrence);
        }

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
