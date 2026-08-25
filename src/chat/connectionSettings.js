/**
 * connectionSettings.js - Conexão com o ArcadeDB, configurada dentro do VSCode.
 *
 * O chat NÃO lê o `config.toml` do projeto, e a independência é o ponto. Aquele
 * arquivo existe para alimentar o `synesis-graph` — que escreve no banco e por
 * isso usa credencial de escrita. Consultar o grafo é outro papel: um
 * pesquisador pode receber credenciais de um supervisor e querer perguntar ao
 * corpus remotamente, sem ter `.synp`, `.synt` nem `config.toml` na máquina.
 *
 * A senha vive em `context.secrets`, nunca em setting nem em arquivo do
 * workspace. Não é precaução teórica: dois vazamentos reais já ocorreram neste
 * ecossistema — a chave da Anthropic saiu de um `settings.json` em texto puro
 * para o contexto de outra ferramenta do editor, e a senha do Neo4j ficou
 * gravada no histórico do git do `synesis-graph` (commit `a7d8b9c`), onde
 * segue recuperável apesar de o `.gitignore` atual cobrir o arquivo.
 * `.gitignore` não apaga o passado.
 */

const vscode = require('vscode');

const SECTION = 'synesisExplorer.chat.arcadedb';
const PASSWORD_SECRET_KEY = 'synesis.arcadedb.password';
const DEFAULT_URI = 'http://localhost:2480';
const DEFAULT_USER = 'root';

/** URI e usuário: não são segredo, então vivem em setting comum. */
function readConnectionSettings() {
    const config = vscode.workspace.getConfiguration(SECTION);
    return {
        uri: (config.get('uri') || DEFAULT_URI).trim(),
        user: (config.get('user') || DEFAULT_USER).trim()
    };
}

function getPassword(context) {
    return context.secrets.get(PASSWORD_SECRET_KEY);
}

/**
 * A conexão completa, ou `undefined` se a senha ainda não foi configurada.
 *
 * A ausência da senha é o sinal de "não configurado": URI e usuário têm default
 * que serve a um servidor local, então só ela distingue um estado do outro.
 */
async function readConnection(context) {
    const password = await getPassword(context);
    if (!password) {
        return undefined;
    }
    return { ...readConnectionSettings(), password };
}

/** Endpoint MCP a partir da URI base. */
function mcpEndpoint(uri) {
    return `${String(uri || DEFAULT_URI).replace(/\/+$/, '')}/api/v1/mcp`;
}

/** Header Basic, no formato que o `mcp.json` espera. */
function basicAuthHeader(user, password) {
    const token = Buffer.from(`${user}:${password || ''}`).toString('base64');
    return `Basic ${token}`;
}

/**
 * Comando "Synesis: Configurar Conexão do Banco".
 *
 * Mesmo molde de `configureProviderCommand`: pergunta o que não é segredo,
 * grava em setting, e pede a senha em `InputBox` mascarado, guardando-a em
 * `context.secrets`.
 */
async function configureConnectionCommand(context) {
    const current = readConnectionSettings();

    const uri = await vscode.window.showInputBox({
        prompt: 'Endereço do servidor ArcadeDB',
        value: current.uri,
        ignoreFocusOut: true,
        validateInput: (v) => (v && /^https?:\/\//.test(v) ? null : 'Informe uma URL http(s) válida.')
    });
    if (!uri) {
        return false;
    }

    const user = await vscode.window.showInputBox({
        prompt: 'Usuário do ArcadeDB (prefira um usuário só de leitura)',
        value: current.user,
        ignoreFocusOut: true,
        validateInput: (v) => (v && v.trim() ? null : 'Informe o usuário.')
    });
    if (!user) {
        return false;
    }

    const existing = await getPassword(context);
    const password = await vscode.window.showInputBox({
        prompt: `Senha de "${user}"`,
        password: true,
        ignoreFocusOut: true,
        placeHolder: existing ? 'Já configurada — digite uma nova para substituir' : undefined,
        validateInput: (v) => (v ? null : 'Informe a senha.')
    });
    if (!password) {
        return false;
    }

    // Global: a conexão é da máquina, não do projeto. O banco é que é por
    // projeto, e vive em `workspaceState` (ver databaseSelection.js).
    const config = vscode.workspace.getConfiguration(SECTION);
    await config.update('uri', uri.trim(), vscode.ConfigurationTarget.Global);
    await config.update('user', user.trim(), vscode.ConfigurationTarget.Global);
    await context.secrets.store(PASSWORD_SECRET_KEY, password);

    vscode.window.showInformationMessage(
        'Synesis: conexão salva. A senha ficou guardada com segurança, fora dos arquivos do projeto.'
    );
    return true;
}

/** Comando "Synesis: Remover Senha do Banco" — útil após rotação. */
async function removeConnectionPasswordCommand(context) {
    await context.secrets.delete(PASSWORD_SECRET_KEY);
    vscode.window.showInformationMessage('Synesis: senha do banco removida.');
}

module.exports = {
    SECTION,
    PASSWORD_SECRET_KEY,
    DEFAULT_URI,
    DEFAULT_USER,
    readConnectionSettings,
    readConnection,
    getPassword,
    mcpEndpoint,
    basicAuthHeader,
    configureConnectionCommand,
    removeConnectionPasswordCommand
};
