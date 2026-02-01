const path = require('path');
const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

class SynesisLspClient {
    constructor() {
        this.client = null;
        this.ready = false;
        this.readyPromise = null;
        this.lastLoadProjectResult = null;
        this.lastLoadProjectAt = null;
        this.effectiveCommand = null;
        this.effectiveArgs = null;
        this.effectiveLabel = null;
        this.outputChannel = null;
    }

    start(pythonPath = 'python', args = []) {
        if (this.client) {
            return this.readyPromise || Promise.resolve();
        }

        const normalizedPath = String(pythonPath || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        const baseName = path.basename(normalizedPath).toLowerCase();

        const command = normalizedPath || pythonPath;
        const normalizedArgs = Array.isArray(args)
            ? args.map(value => String(value))
            : String(args || '').trim().split(/\s+/).filter(Boolean);
        this.effectiveCommand = command;
        this.effectiveArgs = normalizedArgs;
        this.effectiveLabel = baseName || command;

        const serverOptions = {
            command,
            args: normalizedArgs,
            transport: TransportKind.stdio
        };

        this.outputChannel = vscode.window.createOutputChannel('Synesis LSP', { log: true });

        const clientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'synesis' }
            ],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{syn,synt,synp,syno,bib}')
            },
            outputChannel: this.outputChannel
        };

        this.client = new LanguageClient(
            'synesisLspClient',
            'Synesis LSP',
            serverOptions,
            clientOptions
        );

        this.readyPromise = this.client.start().then(() => {
            this.ready = true;
            if (this.outputChannel && this.client.initializeResult) {
                const caps = this.client.initializeResult.capabilities;
                this.outputChannel.appendLine(
                    `Server capabilities: hover=${!!caps.hoverProvider}, ` +
                    `completion=${!!caps.completionProvider}, ` +
                    `definition=${!!caps.definitionProvider}, ` +
                    `rename=${!!caps.renameProvider}`
                );
            }
        });

        return this.readyPromise;
    }

    stop() {
        if (!this.client) {
            return Promise.resolve();
        }

        const client = this.client;
        this.client = null;
        this.ready = false;
        this.readyPromise = null;

        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = null;
        }

        return client.stop();
    }

    isReady() {
        return Boolean(this.client && this.ready);
    }

    async sendRequest(method, params) {
        if (!this.client) {
            throw new Error('Synesis LSP client is not started.');
        }

        if (this.readyPromise) {
            await this.readyPromise;
        }

        let result;
        try {
            if (this._isSynesisMethod(method)) {
                result = await this._sendExecuteCommand(method, params);
            } else {
                result = await this.client.sendRequest(method, params);
            }
        } catch (error) {
            if (this._isSynesisMethod(method)) {
                // Fallback to direct request if executeCommand failed for any reason.
                result = await this.client.sendRequest(method, params);
            } else {
                throw error;
            }
        }

        if (method === 'synesis/loadProject') {
            this.lastLoadProjectResult = result;
            this.lastLoadProjectAt = Date.now();
        }
        return result;
    }

    _isSynesisMethod(method) {
        return typeof method === 'string' && method.startsWith('synesis/');
    }

    _isMethodNotFound(error) {
        return Boolean(error && (error.code === -32601 || /Method Not Found/i.test(error.message)));
    }

    async _sendExecuteCommand(method, params) {
        const execParams = {
            command: method,
            arguments: params !== undefined ? [params] : []
        };
        return this.client.sendRequest('workspace/executeCommand', execParams);
    }

    get lastLoadProject() {
        return this.lastLoadProjectResult;
    }

    get lastLoadProjectTimestamp() {
        return this.lastLoadProjectAt;
    }

    getEffectiveCommand() {
        return this.effectiveCommand;
    }

    getEffectiveArgs() {
        return this.effectiveArgs || [];
    }

    getEffectiveLabel() {
        return this.effectiveLabel;
    }
}

module.exports = SynesisLspClient;
