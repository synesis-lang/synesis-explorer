/**
 * extension.js - Entry point for Synesis Explorer VSCode extension
 *
 * Propósito:
 *     Registra explorers, viewers, comandos e file watchers.
 *     Gerencia lifecycle da extensão.
 *
 * Componentes principais:
 *     - activate: Inicializa extensão e registra componentes
 *     - deactivate: Cleanup ao desativar extensão
 *
 * Dependências críticas:
 *     - vscode: API do VSCode
 *     - explorers: Reference, Code, Relation explorers
 *     - viewers: Graph, Abstract viewers
 *     - core: TemplateManager
 *
 * Notas de implementação:
 *     - Activation event: onStartupFinished (lazy loading)
 *     - File watchers para .syn, .synt, .synp
 *     - Template manager compartilhado entre explorers
 */

const path = require('path');
const vscode = require('vscode');

// Core
const TemplateManager = require('./src/core/templateManager');
const WorkspaceScanner = require('./src/core/workspaceScanner');

// Explorers
const ReferenceExplorer = require('./src/explorers/reference/referenceExplorer');
const CodeExplorer = require('./src/explorers/code/codeExplorer');
const RelationExplorer = require('./src/explorers/relation/relationExplorer');
const OntologyExplorer = require('./src/explorers/ontology/ontologyExplorer');
const OntologyAnnotationExplorer = require('./src/explorers/ontology/ontologyAnnotationExplorer');

// Viewers
const GraphViewer = require('./src/viewers/graphViewer');
const AbstractViewer = require('./src/viewers/abstractViewer');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Synesis Explorer is now active');
    vscode.commands.executeCommand('setContext', 'synesis.hasChains', false);
    vscode.commands.executeCommand('setContext', 'synesis.hasTopics', false);
    vscode.commands.executeCommand('setContext', 'synesis.hasOntologyAnnotations', false);

    const editorConfig = vscode.workspace.getConfiguration('editor');
    editorConfig.update('wordWrap', 'on', vscode.ConfigurationTarget.Workspace);

    // Shared template manager
    const templateManager = new TemplateManager();
    const workspaceScanner = new WorkspaceScanner();

    // Initialize Reference Explorer
    const referenceExplorer = new ReferenceExplorer(workspaceScanner);
    const referenceTreeView = vscode.window.createTreeView('synesisReferenceExplorer', {
        treeDataProvider: referenceExplorer,
        showCollapseAll: true
    });

    const codeExplorer = new CodeExplorer(workspaceScanner, templateManager);
    const codeTreeView = vscode.window.createTreeView('synesisCodeExplorer', {
        treeDataProvider: codeExplorer,
        showCollapseAll: true
    });

    const relationExplorer = new RelationExplorer(workspaceScanner, templateManager);
    const relationTreeView = vscode.window.createTreeView('synesisRelationExplorer', {
        treeDataProvider: relationExplorer,
        showCollapseAll: true
    });

    const ontologyExplorer = new OntologyExplorer(workspaceScanner, templateManager);
    const ontologyTreeView = vscode.window.createTreeView('synesisOntologyTopicsExplorer', {
        treeDataProvider: ontologyExplorer,
        showCollapseAll: true
    });

    const ontologyAnnotationExplorer = new OntologyAnnotationExplorer(workspaceScanner, templateManager);
    const ontologyAnnotationTreeView = vscode.window.createTreeView('synesisOntologyAnnotationExplorer', {
        treeDataProvider: ontologyAnnotationExplorer,
        showCollapseAll: true
    });

    const abstractViewer = new AbstractViewer(workspaceScanner, templateManager);
    const graphViewer = new GraphViewer(workspaceScanner, templateManager);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.reference.refresh', () => {
            referenceExplorer.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.reference.filter', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'Filter references by name (leave blank to show all)',
                value: referenceExplorer.getFilter()
            });

            if (value === undefined) {
                return;
            }

            referenceExplorer.setFilter(value);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.code.refresh', () => {
            codeExplorer.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.code.filter', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'Filter codes by name (leave blank to show all)',
                value: codeExplorer.getFilter()
            });

            if (value === undefined) {
                return;
            }

            codeExplorer.setFilter(value);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.relation.refresh', () => {
            relationExplorer.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.relation.filter', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'Filter relations by name (leave blank to show all)',
                value: relationExplorer.getFilter()
            });

            if (value === undefined) {
                return;
            }

            relationExplorer.setFilter(value);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.ontology.refresh', () => {
            ontologyExplorer.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.ontology.filter', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'Filter topics by name (leave blank to show all)',
                value: ontologyExplorer.getFilter()
            });

            if (value === undefined) {
                return;
            }

            ontologyExplorer.setFilter(value);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.ontology.annotation.refresh', () => {
            ontologyAnnotationExplorer.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.showAbstract', () => {
            abstractViewer.showAbstract();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.showGraph', () => {
            graphViewer.showGraph();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.openLocation', (filePath, line, column) => {
            openLocation(filePath, line, column);
        })
    );

    // File watchers
    const synWatcher = vscode.workspace.createFileSystemWatcher('**/*.syn');
    synWatcher.onDidChange(() => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    synWatcher.onDidCreate(() => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    synWatcher.onDidDelete(() => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    context.subscriptions.push(synWatcher);

    const synoWatcher = vscode.workspace.createFileSystemWatcher('**/*.syno');
    synoWatcher.onDidChange(() => {
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    synoWatcher.onDidCreate(() => {
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    synoWatcher.onDidDelete(() => {
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    context.subscriptions.push(synoWatcher);

    const projectWatcher = vscode.workspace.createFileSystemWatcher('**/*.synp');
    projectWatcher.onDidChange(() => {
        templateManager.invalidateCache();
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    projectWatcher.onDidCreate(() => {
        templateManager.invalidateCache();
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    projectWatcher.onDidDelete(() => {
        templateManager.invalidateCache();
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    context.subscriptions.push(projectWatcher);

    const templateWatcher = vscode.workspace.createFileSystemWatcher('**/*.synt');
    templateWatcher.onDidChange(() => {
        templateManager.invalidateCache();
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    });
    context.subscriptions.push(templateWatcher);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateActiveFileKind(editor);
            ontologyAnnotationExplorer.refresh();
        })
    );

    updateActiveFileKind(vscode.window.activeTextEditor);

    // Initial scan (delayed to avoid blocking startup)
    setTimeout(() => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    }, 1000);

    context.subscriptions.push(referenceTreeView);
    context.subscriptions.push(codeTreeView);
    context.subscriptions.push(relationTreeView);
    context.subscriptions.push(ontologyTreeView);
    context.subscriptions.push(ontologyAnnotationTreeView);
}

/**
 * Opens a file at a specific line number
 */
async function openLocation(filePath, line, column = 0) {
    try {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(line, Math.max(0, column || 0));
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open location: ${error.message}`);
    }
}

function deactivate() {
    console.log('Synesis Explorer is now deactivated');
}

/**
 * Atualiza contexto do tipo de arquivo ativo
 * @param {vscode.TextEditor|undefined|null} editor
 */
function updateActiveFileKind(editor) {
    if (!editor || !editor.document || !editor.document.uri) {
        vscode.commands.executeCommand('setContext', 'synesis.activeFileKind', 'other');
        return;
    }

    const ext = path.extname(editor.document.uri.fsPath || '').toLowerCase();
    if (ext === '.syn') {
        vscode.commands.executeCommand('setContext', 'synesis.activeFileKind', 'syn');
        return;
    }
    if (ext === '.syno') {
        vscode.commands.executeCommand('setContext', 'synesis.activeFileKind', 'syno');
        return;
    }

    vscode.commands.executeCommand('setContext', 'synesis.activeFileKind', 'other');
}

module.exports = {
    activate,
    deactivate
};
