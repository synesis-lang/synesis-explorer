/**
 * workspaceScanner.js - Busca e indexa arquivos Synesis no workspace
 *
 * Propósito:
 *     Encontra arquivos .syn, .synt, .synp no workspace VSCode.
 *     Fornece interface simples para explorers.
 *
 * Componentes principais:
 *     - findSynFiles: Glob para arquivos .syn
 *     - findProjectFile: Localiza .synp (com quick pick se múltiplos)
 *     - findTemplateFile: Localiza .synt associado ao projeto
 *
 * Dependências críticas:
 *     - vscode: API de workspace
 *
 * Exemplo de uso:
 *     const scanner = new WorkspaceScanner();
 *     const synFiles = await scanner.findSynFiles();
 *     const project = await scanner.findProjectFile();
 */

const vscode = require('vscode');

class WorkspaceScanner {
    /**
     * Busca todos os arquivos .syn no workspace
     * @returns {Promise<vscode.Uri[]>}
     */
    async findSynFiles() {
        return await vscode.workspace.findFiles(
            '**/*.syn',
            '**/node_modules/**'
        );
    }

    /**
     * Busca todos os arquivos .syno no workspace
     * @returns {Promise<vscode.Uri[]>}
     */
    async findSynoFiles() {
        return await vscode.workspace.findFiles(
            '**/*.syno',
            '**/node_modules/**'
        );
    }

    /**
     * Busca arquivo .synp (projeto). Se múltiplos, pede ao usuário escolher.
     * @returns {Promise<vscode.Uri|null>}
     */
    async findProjectFile() {
        const projects = await vscode.workspace.findFiles(
            '**/*.synp',
            '**/node_modules/**'
        );

        if (projects.length === 0) {
            return null;
        }

        if (projects.length === 1) {
            return projects[0];
        }

        // Múltiplos projetos: mostrar quick pick
        const items = projects.map(uri => ({
            label: this._getFileName(uri),
            description: this._getRelativePath(uri),
            uri: uri
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Multiple Synesis projects found. Select one:'
        });

        return selected ? selected.uri : null;
    }

    /**
     * Busca arquivo .synt (template) no mesmo diretório do projeto
     * @param {vscode.Uri} projectUri - URI do arquivo .synp
     * @returns {Promise<vscode.Uri|null>}
     */
    async findTemplateFile(projectUri) {
        if (!projectUri) {
            return null;
        }

        const projectDir = this._getDirectory(projectUri);
        const templates = await vscode.workspace.findFiles(
            `${projectDir}/**/*.synt`,
            '**/node_modules/**'
        );

        return templates.length > 0 ? templates[0] : null;
    }

    /**
     * Extrai nome do arquivo de uma URI
     * @private
     */
    _getFileName(uri) {
        const path = uri.fsPath;
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /**
     * Extrai caminho relativo ao workspace
     * @private
     */
    _getRelativePath(uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return uri.fsPath;
        }
        return uri.fsPath.substring(workspaceFolder.uri.fsPath.length + 1);
    }

    /**
     * Extrai diretório de uma URI
     * @private
     */
    _getDirectory(uri) {
        const path = uri.fsPath;
        return path.substring(0, path.lastIndexOf('/'));
    }
}

module.exports = WorkspaceScanner;
