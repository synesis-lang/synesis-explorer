/**
 * databaseSelection.js - Escolha do banco ArcadeDB que o @synesis consulta.
 *
 * O prompt de sistema do participant era fixo e não dizia qual banco usar, o
 * que obrigava o modelo a chamar `list_databases` a cada conversa e a adivinhar
 * quando havia mais de um. Aqui o banco vira estado explícito do workspace.
 *
 * `workspaceState` e não `globalState`: projetos diferentes analisam bancos
 * diferentes, e herdar a escolha de outro projeto ao abrir uma janela nova
 * seria pior do que não ter escolha nenhuma.
 */

const vscode = require('vscode');

const SELECTED_DATABASE_KEY = 'synesis.chat.selectedDatabase';
const LIST_DATABASES_TOOL = 'list_databases';

/**
 * Extrai os nomes de banco do resultado de `list_databases`.
 *
 * O MCP do ArcadeDB devolve o payload como TEXTO JSON dentro de uma parte de
 * texto — verificado contra o servidor real (26.7.3): `{"databases":["face85"]}`.
 * Não é um objeto estruturado, daí o JSON.parse.
 *
 * Tolerante de propósito: um servidor que responda em outro formato, ou um
 * texto que não seja JSON, devolve lista vazia em vez de derrubar o comando —
 * quem chama trata a lista vazia com uma mensagem clara.
 */
function parseDatabaseNames(toolResult) {
    const parts = (toolResult && toolResult.content) || [];
    const names = [];

    for (const part of parts) {
        const text = part && typeof part.value === 'string' ? part.value : null;
        if (!text) {
            continue;
        }

        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            continue;
        }

        // Formato conhecido: { databases: [...] }. Aceita também um array puro,
        // que é o outro shape plausível caso o servidor mude.
        const list = Array.isArray(payload) ? payload : payload && payload.databases;
        if (!Array.isArray(list)) {
            continue;
        }

        for (const entry of list) {
            if (typeof entry === 'string' && entry) {
                names.push(entry);
            } else if (entry && typeof entry.name === 'string' && entry.name) {
                names.push(entry.name);
            }
        }
    }

    // Dedup preservando a ordem em que o servidor listou.
    return [...new Set(names)];
}

/** Banco escolhido para este workspace, ou undefined se ainda não houver. */
function getSelectedDatabase(context) {
    return context.workspaceState.get(SELECTED_DATABASE_KEY);
}

function setSelectedDatabase(context, database) {
    return context.workspaceState.update(SELECTED_DATABASE_KEY, database);
}

/**
 * Compõe o prompt de sistema com a instrução de banco.
 *
 * As duas instruções são mutuamente exclusivas de propósito: ou o modelo sabe
 * qual banco usar, ou é mandado descobrir. O texto base não fala de escolha de
 * banco justamente para que estas duas não se contradigam.
 */
function buildSystemPromptWithDatabase(basePrompt, database) {
    if (!database) {
        return (
            `${basePrompt}\n\n` +
            'Nenhum banco foi selecionado. Chame list_databases primeiro para descobrir ' +
            'os bancos disponíveis, e nunca adivinhe um nome de banco.'
        );
    }
    return (
        `${basePrompt}\n\n` +
        `O banco selecionado para esta conversa é "${database}". Use-o em todas as ` +
        'consultas, sem chamar list_databases nem perguntar ao usuário qual banco usar.'
    );
}

/** Rótulo da status bar. Curto de propósito: divide espaço com o item do LSP. */
function formatStatusBarText(database) {
    return database ? `$(database) ${database}` : '$(database) Sem banco';
}

function formatStatusBarTooltip(database) {
    return database
        ? `Synesis Chat: @synesis consulta o banco "${database}". Clique para trocar.`
        : 'Synesis Chat: nenhum banco selecionado. Clique para escolher.';
}

/**
 * Comando "Synesis: Selecionar Banco do Chat".
 *
 * A lista vem da ferramenta MCP real, não de constante no código: se o
 * pesquisador criar um banco novo, ele aparece aqui sem precisar de release.
 */
async function selectDatabaseCommand(context, onChanged) {
    try {
        await vscode.commands.executeCommand('workbench.mcp.startServer', '*', { waitForLiveTools: true });
    } catch (error) {
        console.warn('Synesis Chat: falha ao iniciar servidores MCP', error);
    }

    // Casa pelo sufixo, não por igualdade: o VSCode mangla o nome de
    // ferramentas MCP para `mcp_<servidor>_<ferramenta>`. Ver a explicação
    // completa em `matchesArcadeDbTool`, em chatParticipant.js.
    const listTool = (vscode.lm.tools || []).find(
        (tool) =>
            tool &&
            typeof tool.name === 'string' &&
            (tool.name === LIST_DATABASES_TOOL || tool.name.endsWith(`_${LIST_DATABASES_TOOL}`))
    );
    if (!listTool) {
        const action = 'Configurar conexão';
        const choice = await vscode.window.showWarningMessage(
            'Synesis: nenhum servidor MCP com list_databases encontrado. O ArcadeDB está no ar e configurado?',
            action
        );
        if (choice === action) {
            await vscode.commands.executeCommand('synesis.chat.setupArcadeDbConnection');
        }
        return undefined;
    }

    let databases;
    try {
        const result = await vscode.lm.invokeTool(listTool.name, { input: {} });
        databases = parseDatabaseNames(result);
    } catch (error) {
        vscode.window.showErrorMessage(`Synesis: falha ao listar bancos — ${error.message || error}`);
        return undefined;
    }

    if (databases.length === 0) {
        vscode.window.showWarningMessage('Synesis: o servidor MCP não devolveu nenhum banco.');
        return undefined;
    }

    const current = getSelectedDatabase(context);
    const picked = await vscode.window.showQuickPick(
        databases.map((name) => ({
            label: name,
            description: name === current ? '(atual)' : undefined
        })),
        { placeHolder: 'Qual banco o @synesis deve consultar?' }
    );

    if (!picked) {
        return undefined;
    }

    await setSelectedDatabase(context, picked.label);
    if (typeof onChanged === 'function') {
        onChanged(picked.label);
    }
    return picked.label;
}

module.exports = {
    SELECTED_DATABASE_KEY,
    LIST_DATABASES_TOOL,
    parseDatabaseNames,
    getSelectedDatabase,
    setSelectedDatabase,
    buildSystemPromptWithDatabase,
    formatStatusBarText,
    formatStatusBarTooltip,
    selectDatabaseCommand
};
