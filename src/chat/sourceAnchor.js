/**
 * sourceAnchor.js — do grafo de volta ao arquivo que o pesquisador escreveu.
 *
 * É o passo que fecha a trilha de auditoria: conceito → trecho → referência →
 * **arquivo e linha da anotação**, clicável. A auditoria deixa de ser "confie na
 * citação" e passa a ser um clique até o texto de origem.
 *
 * Só é possível porque o `synesis-graph` grava `source_file`/`source_line` no
 * vértice `Item` (Etapa A). O caminho é **relativo à raiz do projeto**, de
 * propósito: um caminho absoluto vazaria a estrutura de diretórios de quem
 * exportou e não resolveria na máquina de quem lê.
 */

const path = require('path');
const vscode = require('vscode');
const { resolveWithinRoots } = require('../core/pathContainment');

/**
 * Monta a `Location` que o `stream.anchor()` recebe.
 *
 * Devolve `undefined` quando falta o que ancorar — grafo anterior à Etapa A, ou
 * workspace fechado. Uma âncora que não abre nada é pior que nenhuma: promete
 * verificação e entrega erro.
 *
 * **A conversão de linha é o detalhe que decide se o clique acerta.** O grafo
 * guarda a linha como o editor a mostra (1 = primeira), e `vscode.Position` é
 * 0-based. Sem o `-1` o clique cai sempre uma linha adiante — silenciosamente,
 * porque abrir o arquivo *quase* certo parece funcionar.
 */
function buildSourceLocation(sourceFile, sourceLine, workspaceRoot, options = {}) {
    // **Contenção (Etapa 5).** O caminho vem do GRAFO, que é dado não confiável:
    // pode ter sido gerado noutra máquina ou servido por um ArcadeDB remoto. Um
    // `source_file` com `../../../` escaparia da raiz; um absoluto abriria o que
    // apontasse. `resolveWithinRoots` recusa os dois.
    //
    // `workspaceRoot` continua aceito como raiz única para não quebrar quem
    // chama assim; `options.roots` é o caminho multi-root.
    const roots = options.roots && options.roots.length ? options.roots : [workspaceRoot];
    const absolute = resolveWithinRoots(sourceFile, roots, options.preferredRoot || workspaceRoot);
    if (!absolute) {
        return undefined;
    }

    // Linha ausente ou inválida ainda vale como âncora: abre o arquivo no topo,
    // que é melhor do que não oferecer link nenhum.
    const line = Number(sourceLine);
    const zeroBased = Number.isFinite(line) && line > 0 ? Math.trunc(line) - 1 : 0;

    return new vscode.Location(vscode.Uri.file(absolute), new vscode.Position(zeroBased, 0));
}

/**
 * Rótulo da âncora — pela REFERÊNCIA, não pelo arquivo.
 *
 * A primeira versão mostrava `face85.syn:171`. Numa resposta com 31 âncoras isso
 * vira uma parede de números que o pesquisador não consegue ligar a citação
 * nenhuma: o arquivo é sempre o mesmo, e a linha não diz de quem é o trecho.
 *
 * O que identifica uma evidência para quem faz pesquisa é a **referência
 * bibliográfica** — `avelar2016 (2016)` — e, quando há mais de um trecho da
 * mesma fonte, algo que os distinga. Daí o trecho inicial da citação: é o que
 * liga o botão ao parágrafo que o pesquisador acabou de ler.
 *
 * O arquivo e a linha continuam no destino do clique, que é onde importam.
 */
const SNIPPET_CHARS = 45;

function anchorTitle(sourceFile, sourceLine, record = {}) {
    const reference = [record.bibtex, record.year && `(${record.year})`]
        .filter(Boolean)
        .join(' ')
        .trim();

    const citation = String(record.citation || '').trim();
    const snippet =
        citation.length > SNIPPET_CHARS
            ? `${citation.slice(0, SNIPPET_CHARS).trimEnd()}…`
            : citation;

    if (reference && snippet) {
        return `${reference}: "${snippet}"`;
    }
    if (reference) {
        return reference;
    }
    if (snippet) {
        return `"${snippet}"`;
    }

    // Sem referência nem trecho, o arquivo e a linha são tudo o que resta —
    // pior rótulo, mas melhor que um botão sem texto.
    const base = path.basename(String(sourceFile || ''));
    const line = Number(sourceLine);
    return Number.isFinite(line) && line > 0 ? `${base}:${line}` : base;
}

/**
 * A raiz contra a qual os caminhos relativos do grafo são resolvidos.
 *
 * Primeira pasta do workspace. Mantida para compatibilidade; o caminho
 * multi-root é `workspaceRoots()`.
 */
function workspaceRootPath() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length ? folders[0].uri.fsPath : undefined;
}

/**
 * Todas as raízes abertas, e qual delas tentar primeiro.
 *
 * **O defeito corrigido (Etapa 5).** Só a primeira pasta do workspace era
 * tentada. Num multi-root — o caso normal de quem abre o projeto de anotação e o
 * repositório do código lado a lado — a âncora não abria, e o erro era mudo: um
 * link que não leva a lugar nenhum parece um bug do editor, não um caminho fora
 * da raiz.
 *
 * A raiz preferida é a do editor ativo, mesmo critério que
 * `workspaceScanner._getActiveWorkspaceFolder()` usa para achar o `.synp`: o
 * arquivo que o pesquisador está olhando é o melhor palpite sobre qual projeto
 * ele tem em mente.
 */
function workspaceRoots() {
    const folders = vscode.workspace.workspaceFolders || [];
    const roots = folders.map((folder) => folder.uri && folder.uri.fsPath).filter(Boolean);

    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
    const activeFolder = active && active.uri ? vscode.workspace.getWorkspaceFolder(active.uri) : undefined;
    const preferredRoot = activeFolder && activeFolder.uri ? activeFolder.uri.fsPath : roots[0];

    return { roots, preferredRoot };
}

/**
 * O arquivo existe?
 *
 * Uma âncora para um arquivo que não está lá promete verificação e entrega erro
 * — o mesmo motivo pelo qual não se ancora sem `source_file`. Acontece de
 * verdade: o grafo é um snapshot, e o `.syn` pode ter sido renomeado ou movido
 * desde o último sync.
 *
 * Best-effort e assíncrono: qualquer falha da API vale como "não dá para
 * confirmar", e nesse caso a âncora é emitida — recusar por indisponibilidade do
 * `stat` seria pior que o problema que ele resolve.
 */
async function fileExists(absolutePath) {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
        return true;
    } catch (error) {
        // `FileNotFound` é a resposta esperada; qualquer outro erro não prova
        // ausência, então só o primeiro caso recusa a âncora.
        return !(error && /entry not found|ENOENT|FileNotFound/i.test(error.message || String(error)));
    }
}

/**
 * Emite as âncoras de um conjunto de origens já agrupadas (`groupByOrigin`).
 *
 * Uma âncora por origem, não por `Item`: um bloco `ITEM` com N chains geraria N
 * links idênticos, e repetir o mesmo destino é o ruído que o agrupamento da
 * Etapa F existe para evitar.
 *
 * Devolve quantas âncoras foram emitidas — quem chama usa para decidir se vale
 * explicar a ausência.
 */
function streamSourceAnchors(stream, groups, workspaceRoot, options = {}) {
    const { citedOnly } = options;
    // **Âncoras da evidência USADA, não de tudo que foi consultado (Etapa 3).**
    //
    // O fluxo anterior emitia uma âncora para cada registro com origem devolvido
    // no turno — incluindo os resultados exploratórios que o modelo consultou e
    // descartou. Uma resposta podia terminar com dezenas de links sem indicar
    // qual sustentava qual frase, o que é ruído com aparência de rigor.
    //
    // `citedOnly` é o conjunto de origens (`arquivo:linha`) que a verificação de
    // literalidade ligou a uma citação da resposta. Quando ele existe, só essas
    // âncoras saem. Quando não — nenhuma citação conferida —, o comportamento
    // antigo é preservado: melhor oferecer as origens consultadas do que
    // nenhuma.
    const all = groups || [];
    const selected =
        citedOnly && citedOnly.size > 0
            ? all.filter((group) => citedOnly.has(originKey(group.file, group.line)))
            : all;

    const roots = (options.roots && options.roots.length ? options.roots : [workspaceRoot]).filter(
        Boolean
    );
    const preferredRoot = options.preferredRoot || workspaceRoot;

    let emitted = 0;
    // As origens que não puderam ser ancoradas. Devolvidas em vez de
    // descartadas: um caminho fora da raiz é informação para o relatório do
    // turno, não um silêncio (Etapa 5).
    const skipped = [];

    for (const group of selected) {
        const location = buildSourceLocation(group.file, group.line, workspaceRoot, {
            roots,
            preferredRoot
        });
        if (!location) {
            skipped.push(group);
            continue;
        }
        stream.anchor(location, anchorTitle(group.file, group.line, group));
        emitted += 1;
    }

    // O retorno continua sendo o NÚMERO de âncoras emitidas — é o que os
    // chamadores usam. As origens recusadas vão para o callback opcional, e não
    // para uma forma de retorno híbrida que confundiria quem só quer a contagem.
    if (skipped.length && typeof options.onSkipped === 'function') {
        options.onSkipped(skipped);
    }

    return emitted;
}

/**
 * A chave que identifica uma origem: arquivo e linha.
 *
 * A mesma forma usada por `groupEvidence`, para que o conjunto de origens
 * citadas e os grupos de âncora se refiram exatamente às mesmas entradas.
 */
function originKey(file, line) {
    return `${file || ''}:${line ?? ''}`;
}

module.exports = {
    buildSourceLocation,
    anchorTitle,
    workspaceRootPath,
    workspaceRoots,
    fileExists,
    streamSourceAnchors,
    originKey
};
