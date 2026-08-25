/**
 * mcpSetup.js - Onboarding da conexão com o ArcadeDB para o @synesis.
 *
 * Escreve `.vscode/mcp.json` na raiz do workspace ABERTO. Isso resolve por
 * construção a armadilha observada nos testes desta série: o arquivo tinha sido
 * criado em `synesis-graph/.vscode/`, mas o workspace aberto era a raiz do
 * ecossistema — e o VSCode só lê `mcp.json` na raiz efetivamente aberta, nunca
 * em subpastas de repositórios. Nada de caminho fixo aqui.
 */

const vscode = require('vscode');
const {
    readConnection,
    configureConnectionCommand,
    mcpEndpoint
} = require('./connectionSettings');

const DEFAULT_SERVER_KEY = 'arcadedb';

/**
 * Mescla a definição do servidor em um `mcp.json` já existente.
 *
 * Preserva TODOS os outros servidores. Sobrescrever o arquivo apagaria
 * configurações que o pesquisador tenha para outros MCPs — e há precedente de
 * perda de dados por sobrescrita cega neste ecossistema.
 *
 * Devolve `{ config, replaced }`: `replaced` diz se uma entrada de mesmo nome
 * foi substituída, para quem chama poder avisar em vez de trocar em silêncio.
 */
function mergeMcpConfig(existingConfig, serverKey, serverDefinition) {
    const base = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
    const servers = base.servers && typeof base.servers === 'object' ? base.servers : {};
    const replaced = Object.prototype.hasOwnProperty.call(servers, serverKey);

    return {
        config: {
            ...base,
            servers: { ...servers, [serverKey]: serverDefinition }
        },
        replaced
    };
}

/** Definição HTTP do servidor, com Basic Auth quando há credenciais. */
function buildServerDefinition(url, username, password) {
    const definition = { type: 'http', url };
    if (username) {
        const token = Buffer.from(`${username}:${password || ''}`).toString('base64');
        definition.headers = { Authorization: `Basic ${token}` };
    }
    return definition;
}

// A detecção de credenciais no `claude_desktop_config.json` foi REMOVIDA nesta
// fase. Ela lia usuário e senha de um arquivo em texto puro para poupar
// digitação — conveniência que contradiz a decisão de manter segredo apenas em
// `context.secrets`. O ganho de ergonomia agora vem de outro lugar: a conexão é
// configurada uma vez na extensão e reusada, então o onboarding já não pergunta
// credencial nenhuma.

/**
 * Lê um `mcp.json` existente distinguindo "não existe" de "não consegui ler".
 *
 * A distinção é o que impede perda de dados: `mcp.json` aceita comentários
 * (JSONC) e o `JSON.parse` falha neles. Se tratássemos essa falha como
 * "arquivo vazio", o merge gravaria um arquivo novo por cima e **apagaria os
 * outros servidores** — exatamente o acidente que o merge existe para evitar.
 *
 * - `{ exists: false }` — não há arquivo; pode gravar do zero.
 * - `{ exists: true, config }` — leu e entendeu; pode mesclar.
 * - `{ exists: true, unreadable: true }` — há arquivo mas não foi possível
 *   interpretá-lo; quem chama deve abortar, não sobrescrever.
 */
async function readExistingMcpConfig(uri) {
    let raw;
    try {
        raw = await vscode.workspace.fs.readFile(uri);
    } catch {
        return { exists: false };
    }

    try {
        return { exists: true, config: JSON.parse(Buffer.from(raw).toString('utf8')) };
    } catch (error) {
        return { exists: true, unreadable: true, reason: error.message || String(error) };
    }
}

/** Comando "Synesis: Conectar ao ArcadeDB (MCP)". */
async function setupArcadeDbConnectionCommand(context) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage(
            'Synesis: abra uma pasta ou workspace antes de configurar a conexão — o mcp.json vive na raiz do workspace.'
        );
        return false;
    }

    // Em workspace multi-root, deixa explícito onde o arquivo vai parar em vez
    // de assumir a primeira pasta em silêncio.
    let targetFolder = folders[0];
    if (folders.length > 1) {
        const picked = await vscode.window.showQuickPick(
            folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
            { placeHolder: 'Em qual raiz do workspace gravar o .vscode/mcp.json?' }
        );
        if (!picked) {
            return false;
        }
        targetFolder = picked.folder;
    }

    // A conexão vem do que o pesquisador configurou na extensão, não de um
    // formulário a cada execução — e a senha vem de `context.secrets`, nunca de
    // arquivo. Se ainda não houver senha, oferece configurar primeiro em vez de
    // gravar um `mcp.json` que não autentica.
    let connection = await readConnection(context);
    if (!connection) {
        const configure = 'Configurar conexão';
        const choice = await vscode.window.showWarningMessage(
            'Synesis: a conexão com o ArcadeDB ainda não foi configurada.',
            configure
        );
        if (choice !== configure) {
            return false;
        }
        if (!(await configureConnectionCommand(context))) {
            return false;
        }
        connection = await readConnection(context);
        if (!connection) {
            return false;
        }
    }

    const mcpUri = vscode.Uri.joinPath(targetFolder.uri, '.vscode', 'mcp.json');
    const existing = await readExistingMcpConfig(mcpUri);

    // Arquivo presente mas ilegível (tipicamente comentários JSONC): gravar por
    // cima apagaria os servidores que estão lá. Aborta e manda o usuário olhar.
    if (existing.unreadable) {
        const openIt = 'Abrir arquivo';
        const choice = await vscode.window.showErrorMessage(
            `Synesis: ${mcpUri.fsPath} existe mas não pôde ser lido como JSON (${existing.reason}). ` +
                'Nada foi gravado — edite o arquivo à mão para não perder os servidores já configurados.',
            openIt
        );
        if (choice === openIt) {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(mcpUri));
        }
        return false;
    }

    const { config, replaced } = mergeMcpConfig(
        existing.config,
        DEFAULT_SERVER_KEY,
        buildServerDefinition(mcpEndpoint(connection.uri), connection.user, connection.password)
    );

    if (replaced) {
        const proceed = await vscode.window.showWarningMessage(
            `Já existe um servidor "${DEFAULT_SERVER_KEY}" em ${mcpUri.fsPath}. Substituir?`,
            { modal: true },
            'Substituir'
        );
        if (proceed !== 'Substituir') {
            return false;
        }
    }

    try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetFolder.uri, '.vscode'));
        await vscode.workspace.fs.writeFile(
            mcpUri,
            Buffer.from(`${JSON.stringify(config, null, 2)}\n`, 'utf8')
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Synesis: falha ao gravar ${mcpUri.fsPath} — ${error.message || error}`);
        return false;
    }

    vscode.window.showInformationMessage(`Synesis: conexão gravada em ${mcpUri.fsPath}.`);

    // Encadeia com a escolha de banco: sem isso o pesquisador teria de saber
    // que existe um segundo comando a rodar.
    await vscode.commands.executeCommand('synesis.chat.selectDatabase');
    return true;
}

module.exports = {
    DEFAULT_SERVER_KEY,
    mergeMcpConfig,
    readExistingMcpConfig,
    buildServerDefinition,
    setupArcadeDbConnectionCommand
};
