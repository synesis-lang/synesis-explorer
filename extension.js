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
const DataService = require('./src/services/dataService');

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
let dataService;
let lspStartPromise;
let lspCommandLabel;
let lspCommandPath;
let lspCommandArgs;
let pendingLspWorkspaceRoot;

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
    const pythonPath = lspConfig.get('lsp.pythonPath', 'synesis-lsp');
    const lspArgs = lspConfig.get('lsp.args', []);

    lspStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    lspStatusItem.tooltip = 'Synesis LSP';
    lspStatusItem.show();
    context.subscriptions.push(lspStatusItem);

    if (lspEnabled) {
        lspClient = new SynesisLspClient();
        lspStartPromise = startLspClient(lspClient, pythonPath, lspArgs);
    } else {
        setLspStatus('disabled');
    }

    // Shared template manager
    const templateManager = new TemplateManager();
    const workspaceScanner = new WorkspaceScanner();

    // DataService (Adapter Pattern: LSP vs local regex)
    dataService = new DataService({
        lspClient: lspClient || null,
        workspaceScanner,
        templateManager,
        onLspIncompatible: () => setLspStatus('incompatible')
    });

    // Initialize Reference Explorer
    const referenceExplorer = new ReferenceExplorer(dataService);
    const referenceTreeView = vscode.window.createTreeView('synesisReferenceExplorer', {
        treeDataProvider: referenceExplorer,
        showCollapseAll: true
    });

    const codeExplorer = new CodeExplorer(dataService);
    const codeTreeView = vscode.window.createTreeView('synesisCodeExplorer', {
        treeDataProvider: codeExplorer,
        showCollapseAll: true
    });

    const relationExplorer = new RelationExplorer(dataService);
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
    const graphViewer = new GraphViewer(dataService);

    // Register commands
    const refreshAllExplorers = () => {
        referenceExplorer.refresh();
        codeExplorer.refresh();
        relationExplorer.refresh();
        ontologyExplorer.refresh();
        ontologyAnnotationExplorer.refresh();
    };

    const runLspLoadProject = async ({ showProgress, showErrorMessage, workspaceRoot }) => {
        if (!lspClient || !lspClient.isReady()) {
            setLspStatus('error');
            if (showErrorMessage) {
                vscode.window.showErrorMessage('Synesis LSP is not ready.');
            }
            return;
        }

        const resolvedRoot = workspaceRoot || resolveWorkspaceRoot(vscode.window.activeTextEditor?.document);
        if (!resolvedRoot) {
            setLspStatus('error');
            if (showErrorMessage) {
                vscode.window.showErrorMessage('No workspace folder found to load project.');
            }
            return;
        }

        setLspStatus('loading');
        try {
            const loadRequest = () => lspClient.sendRequest('synesis/loadProject', { workspaceRoot: resolvedRoot });
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

    if (lspStartPromise) {
        lspStartPromise.then((started) => {
            if (started) {
                runLspLoadProject({ showProgress: true, showErrorMessage: true });
            } else {
                refreshAllExplorers();
            }
        });
    } else {
        setTimeout(() => refreshAllExplorers(), 500);
    }

    const scheduleLspLoadProject = (document) => {
        if (!lspClient || !lspClient.isReady()) {
            return;
        }
        if (lspLoadTimer) {
            clearTimeout(lspLoadTimer);
        }
        pendingLspWorkspaceRoot = resolveWorkspaceRoot(document) || pendingLspWorkspaceRoot;
        lspLoadTimer = setTimeout(() => {
            runLspLoadProject({
                showProgress: false,
                showErrorMessage: false,
                workspaceRoot: pendingLspWorkspaceRoot
            });
        }, 1000);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.lsp.loadProject', async () => {
            await runLspLoadProject({
                showProgress: true,
                showErrorMessage: true,
                workspaceRoot: resolveWorkspaceRoot(vscode.window.activeTextEditor?.document)
            });
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

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.code.goToDefinition', async (treeItem) => {
            if (!treeItem || !treeItem.code) {
                return;
            }

            const position = await findSymbolPosition(treeItem);
            if (!position) {
                vscode.window.showWarningMessage('Could not find code position for definition lookup.');
                return;
            }

            const definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                position.uri,
                position.position
            );

            if (definitions && definitions.length > 0) {
                const def = definitions[0];
                const targetUri = def.targetUri || def.uri;
                const targetRange = def.targetRange || def.range;
                const doc = await vscode.workspace.openTextDocument(targetUri);
                const editor = await vscode.window.showTextDocument(doc);
                editor.selection = new vscode.Selection(targetRange.start, targetRange.start);
                editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenter);
            } else {
                vscode.window.showWarningMessage(`No definition found for "${treeItem.code}".`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.code.rename', async (treeItem) => {
            await renameSymbol(treeItem, 'code', 'Enter new code name');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('synesis.reference.rename', async (treeItem) => {
            await renameSymbol(treeItem, 'bibref', 'Enter new reference name (with @)');
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
                scheduleLspLoadProject(document);
            }
        })
    );

    updateActiveFileKind(vscode.window.activeTextEditor);

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

/**
 * Finds a position in the workspace where a symbol (code or bibref) appears.
 * Used by Go to Definition and Rename handlers.
 */
async function findSymbolPosition(treeItem) {
    const symbol = treeItem.code || treeItem.bibref;
    if (!symbol) {
        return null;
    }

    if (treeItem.occurrences && treeItem.occurrences.length > 0) {
        const occ = treeItem.occurrences[0];
        const uri = vscode.Uri.file(occ.file);
        return { uri, position: new vscode.Position(occ.line, occ.column || 0) };
    }

    const files = await vscode.workspace.findFiles('**/*.syn', null, 50);
    for (const fileUri of files) {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const text = doc.getText();
        const idx = text.indexOf(symbol);
        if (idx >= 0) {
            const pos = doc.positionAt(idx);
            return { uri: fileUri, position: pos };
        }
    }

    return null;
}

/**
 * Renames a symbol (code or bibref) using the LSP rename provider.
 */
async function renameSymbol(treeItem, symbolKey, promptMessage) {
    const symbol = treeItem ? treeItem[symbolKey] : null;
    if (!symbol) {
        return;
    }

    const newName = await vscode.window.showInputBox({
        prompt: promptMessage,
        value: symbol,
        validateInput: (value) => {
            if (!value || !value.trim()) {
                return 'Name cannot be empty';
            }
            if (value.trim() === symbol) {
                return 'Name must be different';
            }
            return null;
        }
    });

    if (!newName) {
        return;
    }

    const position = await findSymbolPosition(treeItem);
    if (!position) {
        vscode.window.showWarningMessage('Could not find symbol position for rename.');
        return;
    }

    try {
        const edit = await vscode.commands.executeCommand(
            'vscode.executeDocumentRenameProvider',
            position.uri,
            position.position,
            newName.trim()
        );

        if (edit && edit.size > 0) {
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(`Renamed "${symbol}" to "${newName.trim()}".`);
        } else {
            vscode.window.showWarningMessage('Rename failed. LSP may not be available.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Rename failed: ${error.message}`);
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

function resolveWorkspaceRoot(document) {
    if (document && document.uri) {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder && folder.uri && folder.uri.fsPath) {
            return folder.uri.fsPath;
        }
    }

    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : '';
}

async function startLspClient(client, pythonPath, lspArgs = []) {
    try {
        const normalizedPath = String(pythonPath || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        lspCommandPath = normalizedPath || pythonPath;
        lspCommandArgs = Array.isArray(lspArgs)
            ? lspArgs.map(value => String(value))
            : String(lspArgs || '').trim().split(/\s+/).filter(Boolean);
        const baseName = path.basename(lspCommandPath).toLowerCase();
        lspCommandLabel = baseName || lspCommandPath;
        setLspStatus('loading');
        await client.start(pythonPath, lspCommandArgs);
        lspCommandLabel = client.getEffectiveLabel() || lspCommandLabel;
        lspCommandPath = client.getEffectiveCommand() || lspCommandPath;
        lspCommandArgs = client.getEffectiveArgs() || lspCommandArgs;
        setLspStatus('ready');
        return true;
    } catch (error) {
        setLspStatus('error');
        const isNotFound = error.message && (
            error.message.includes('ENOENT') ||
            error.message.includes('not found') ||
            error.message.includes('not recognized')
        );
        const hint = isNotFound
            ? ` Is "${pythonPath}" installed and on PATH?`
            : '';
        vscode.window.showErrorMessage(`Failed to start Synesis LSP: ${error.message}.${hint}`);
        return false;
    }
}

function setLspStatus(state, stats) {
    if (!lspStatusItem) {
        return;
    }

    const commandLabel = lspCommandLabel || 'LSP';
    const commandPath = lspCommandPath || '';
    const commandArgs = Array.isArray(lspCommandArgs) && lspCommandArgs.length > 0
        ? ` ${lspCommandArgs.join(' ')}`
        : '';

    if (commandPath) {
        lspStatusItem.tooltip = `Synesis LSP: ${commandPath}${commandArgs}`;
    } else {
        lspStatusItem.tooltip = 'Synesis LSP';
    }

    if (state === 'disabled') {
        lspStatusItem.text = `$(circle-slash) LSP Disabled (${commandLabel})`;
        return;
    }

    if (state === 'loading') {
        lspStatusItem.text = `$(sync) LSP Loading (${commandLabel})`;
        return;
    }

    if (state === 'error') {
        lspStatusItem.text = `$(alert) LSP Error (${commandLabel})`;
        return;
    }

    if (state === 'incompatible') {
        lspStatusItem.text = `$(alert) LSP Incompatível (${commandLabel})`;
        return;
    }

    if (state === 'ready') {
        if (stats && typeof stats.source_count === 'number' && typeof stats.item_count === 'number') {
            lspStatusItem.text = `$(check) Ready (${stats.source_count} sources, ${stats.item_count} items)`;
        } else {
            lspStatusItem.text = `$(check) LSP Ready (${commandLabel})`;
        }
    }
}

module.exports = {
    activate,
    deactivate
};
