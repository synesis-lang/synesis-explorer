const path = require('path');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

class SynesisLspClient {
    constructor() {
        this.client = null;
        this.ready = false;
        this.readyPromise = null;
        this.lastLoadProjectResult = null;
        this.lastLoadProjectAt = null;
    }

    start(pythonPath = 'python') {
        if (this.client) {
            return this.readyPromise || Promise.resolve();
        }

        const normalizedPath = String(pythonPath || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        const baseName = path.basename(normalizedPath).toLowerCase();
        const isSynesisLsp = baseName === 'synesis-lsp' || baseName === 'synesis-lsp.exe';

        const serverOptions = {
            command: normalizedPath || pythonPath,
            args: isSynesisLsp ? [] : ['-m', 'synesis_lsp'],
            transport: TransportKind.stdio
        };

        const clientOptions = {
            documentSelector: [{ language: 'synesis' }]
        };

        this.client = new LanguageClient(
            'synesisLspClient',
            'Synesis LSP',
            serverOptions,
            clientOptions
        );

        this.readyPromise = this.client.start().then(() => {
            this.ready = true;
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

        const result = await this.client.sendRequest(method, params);
        if (method === 'synesis/loadProject') {
            this.lastLoadProjectResult = result;
            this.lastLoadProjectAt = Date.now();
        }
        return result;
    }

    get lastLoadProject() {
        return this.lastLoadProjectResult;
    }

    get lastLoadProjectTimestamp() {
        return this.lastLoadProjectAt;
    }
}

module.exports = SynesisLspClient;
