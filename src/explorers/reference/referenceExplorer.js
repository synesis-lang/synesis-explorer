/**
 * referenceExplorer.js - TreeDataProvider para navegação de referências
 *
 * Propósito:
 *     Detecta e lista todas as referências SOURCE @bibref no workspace.
 *     Mostra ocorrências e contagem de ITEMs por referência.
 *
 * Componentes principais:
 *     - scanWorkspace: Escaneia todos .syn e indexa referências
 *     - getTreeItem: Retorna TreeItem para renderização
 *     - getChildren: Hierarquia (refs -> ocorrências)
 *
 * Dependências críticas:
 *     - WorkspaceScanner: Busca arquivos .syn
 *     - SynesisParser: Parse de blocos SOURCE
 *
 * Exemplo de uso:
 *     const explorer = new ReferenceExplorer(scanner);
 *     await explorer.refresh();
 *     // TreeView mostra refs com ocorrências
 */

const vscode = require('vscode');
const SynesisParser = require('../../parsers/synesisParser');

class ReferenceExplorer {
    constructor(workspaceScanner) {
        this.scanner = workspaceScanner;
        this.parser = new SynesisParser();
        this.references = new Map(); // bibref -> [occurrences]
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Escaneia workspace e atualiza índice de referências
     */
    async refresh() {
        this.references.clear();

        try {
            const synFiles = await this.scanner.findSynFiles();

            for (const fileUri of synFiles) {
                await this._scanFile(fileUri);
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning workspace:', error);
            vscode.window.showErrorMessage(`Failed to scan workspace: ${error.message}`);
        }
    }

    /**
     * Escaneia um arquivo .syn individual
     * @private
     */
    async _scanFile(fileUri) {
        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = content.toString();
            const filePath = fileUri.fsPath;

            // Parse SOURCE blocks
            const sources = this.parser.parseSourceBlocks(text, filePath);

            for (const source of sources) {
                // Contar ITEMs para esta referência no arquivo inteiro
                const itemCount = this.parser.countItemsInSource(text, source.bibref);

                // Adicionar ocorrência
                if (!this.references.has(source.bibref)) {
                    this.references.set(source.bibref, []);
                }

                this.references.get(source.bibref).push({
                    file: filePath,
                    line: source.line,
                    itemCount: itemCount
                });
            }
        } catch (error) {
            console.error(`Error scanning file ${fileUri.fsPath}:`, error);
        }
    }

    /**
     * Retorna TreeItem para um elemento
     * @param {ReferenceTreeItem|OccurrenceTreeItem} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        return element;
    }

    /**
     * Retorna filhos de um elemento
     * @param {ReferenceTreeItem|undefined} element
     * @returns {Promise<Array>}
     */
    async getChildren(element) {
        if (!element) {
            // Root level: lista de referências
            const items = [];
            const filter = this.filterText;

            for (const [bibref, occurrences] of this.references.entries()) {
                if (filter && !bibref.toLowerCase().includes(filter)) {
                    continue;
                }
                const totalItems = occurrences.reduce((sum, occ) => sum + occ.itemCount, 0);
                items.push(new ReferenceTreeItem(bibref, occurrences.length, totalItems, occurrences));
            }

            return items.sort((a, b) => a.bibref.localeCompare(b.bibref));
        } else {
            // Child level: lista de ocorrências
            return element.occurrences.map(occ => new OccurrenceTreeItem(occ));
        }
    }

    /**
     * Atualiza o filtro por nome de referência
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

/**
 * TreeItem para uma referência (nível raiz)
 */
class ReferenceTreeItem extends vscode.TreeItem {
    constructor(bibref, occurrenceCount, itemCount, occurrences) {
        super(bibref, vscode.TreeItemCollapsibleState.Collapsed);

        this.bibref = bibref;
        this.occurrences = occurrences;

        this.description = `${occurrenceCount} file(s), ${itemCount} item(s)`;
        this.iconPath = new vscode.ThemeIcon('book');
        this.contextValue = 'reference';
    }
}

/**
 * TreeItem para uma ocorrência (nível filho)
 */
class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        const fileName = occurrence.file.substring(occurrence.file.lastIndexOf('/') + 1);
        const label = `${fileName}:${occurrence.line}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = `${occurrence.itemCount} item(s)`;
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = occurrence.file;
        this.contextValue = 'occurrence';

        // Comando para navegação
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [occurrence.file, occurrence.line]
        };
    }
}

module.exports = ReferenceExplorer;
