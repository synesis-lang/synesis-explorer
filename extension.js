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
const SynesisLspClient = require('./src/lsp/synesisClient');

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

let lspClient;
let lspStatusItem;
let lspLoadTimer;

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

    // LSP setup
    const lspConfig = vscode.workspace.getConfiguration('synesisExplorer');
    const lspEnabled = lspConfig.get('lsp.enabled', true);
    const pythonPath = lspConfig.get('lsp.pythonPath', 'python');

    lspStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    lspStatusItem.tooltip = 'Synesis LSP';
    lspStatusItem.show();
    context.subscriptions.push(lspStatusItem);

    if (lspEnabled) {
        lspClient = new SynesisLspClient();
        startLspClient(lspClient, pythonPath);
    } else {
        setLspStatus('disabled');
    }

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
    const refreshAllExplorers = () => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    };

    const runLspLoadProject = async ({ showProgress, showErrorMessage }) => {
        if (!lspClient || !lspClient.isReady()) {
            setLspStatus('error');
            if (showErrorMessage) {
                vscode.window.showErrorMessage('Synesis LSP is not ready.');
            }
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            setLspStatus('error');
            if (showErrorMessage) {
                vscode.window.showErrorMessage('No workspace folder found to load project.');
            }
            return;
        }

        setLspStatus('loading');
        try {
            const loadRequest = () => lspClient.sendRequest('synesis/loadProject', { workspaceRoot });
            const result = showProgress
                ? await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Window,
                        title: 'Synesis LSP: Loading project'
                    },
                    loadRequest
                )
                : await loadRequest();

            if (result && result.success) {
                setLspStatus('ready', result.stats);
                refreshAllExplorers();
            } else {
                setLspStatus('error');
                if (showErrorMessage) {
                    const message = result && result.error ? result.error : 'Unknown error from LSP.';
                    vscode.window.showErrorMessage(`Synesis LSP load failed: ${message}`);
                }
            }
        } catch (error) {
            setLspStatus('error');
            if (showErrorMessage) {
                vscode.window.showErrorMessage(`Synesis LSP load failed: ${error.message}`);
            }
        }
    };

    const scheduleLspLoadProject = () => {
        if (!lspClient || !lspClient.isReady()) {
            return;
        }
        if (lspLoadTimer) {
            clearTimeout(lspLoadTimer);
        }
        lspLoadTimer = setTimeout(() => {
            runLspLoadProject({ showProgress: false, showErrorMessage: false });
        }, 1000);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.lsp.loadProject', async () => {
            await runLspLoadProject({ showProgress: true, showErrorMessage: true });
        })
    );

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

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            const ext = path.extname(document.uri.fsPath || '').toLowerCase();
            if (ext === '.syn' || ext === '.syno' || ext === '.synp' || ext === '.synt' || ext === '.bib') {
                scheduleLspLoadProject();
            }
        })
    );

    updateActiveFileKind(vscode.window.activeTextEditor);

    // Initial scan (delayed to avoid blocking startup)
    setTimeout(() => {
        refreshAllExplorers();
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
    if (lspClient) {
        lspClient.stop();
        lspClient = undefined;
    }
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

async function startLspClient(client, pythonPath) {
    try {
        setLspStatus('loading');
        await client.start(pythonPath);
        setLspStatus('ready');
    } catch (error) {
        setLspStatus('error');
        vscode.window.showErrorMessage(`Failed to start Synesis LSP: ${error.message}`);
    }
}

function setLspStatus(state, stats) {
    if (!lspStatusItem) {
        return;
    }

    if (state === 'disabled') {
        lspStatusItem.text = '$(circle-slash) LSP Disabled';
        return;
    }

    if (state === 'loading') {
        lspStatusItem.text = '$(sync) LSP Loading';
        return;
    }

    if (state === 'error') {
        lspStatusItem.text = '$(alert) LSP Error';
        return;
    }

    if (state === 'ready') {
        if (stats && typeof stats.source_count === 'number' && typeof stats.item_count === 'number') {
            lspStatusItem.text = `$(check) Ready (${stats.source_count} sources, ${stats.item_count} items)`;
        } else {
            lspStatusItem.text = '$(check) LSP Ready';
        }
    }
}

module.exports = {
    activate,
    deactivate
};
