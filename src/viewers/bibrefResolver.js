/**
 * bibrefResolver.js - Resolve o bibref a partir da posição do cursor
 *
 * Propósito:
 *     Dado o conjunto de blocos (getBlocks) e a linha do cursor, decide a qual
 *     referência bibliográfica o cursor pertence.
 *
 * Por que existe como módulo separado:
 *     A lógica vivia em `_bibrefFromBlocks`, que recebia um `vscode.TextDocument`
 *     só para converter offset em linha — o que a tornava intestável sem o
 *     editor. Aqui ela opera sobre linhas puras; `abstractViewer` faz a
 *     conversão e delega.
 *
 * A regra do gap:
 *     Depois que o getBlocks passou a delimitar blocos pelo `END` real (F2),
 *     comentários e linhas em branco entre blocos deixaram de pertencer ao
 *     bloco anterior — passaram a ficar num gap, sem dono.
 *
 *     Um comentário escrito ACIMA de um bloco o rotula; é assim que o
 *     pesquisador o lê na tela. Portanto, num gap formado apenas por
 *     comentários e linhas em branco, o cursor pertence ao bloco SEGUINTE.
 *
 *     Isso conserta dois sintomas de uma vez:
 *       - cursor num cabeçalho comentado no topo do arquivo devolvia `null`
 *         ("No reference found"), porque não havia bloco anterior;
 *       - cursor no comentário que rotula a 2ª fonte devolvia a 1ª.
 *
 *     Se houver QUALQUER conteúdo real no gap (um bloco de outro tipo, texto
 *     solto), a regra não se aplica: cai no comportamento antigo — último bloco
 *     que começa antes do cursor.
 */

'use strict';

/** Uma linha é "neutra" se for vazia ou um comentário de linha inteira. */
function isNeutralLine(line) {
    const trimmed = String(line == null ? '' : line).trim();
    return trimmed === '' || trimmed.startsWith('#');
}

/**
 * Resolve o bibref para a linha do cursor.
 *
 * @param {Array<{bibref: string, range: {start: {line: number}, end: {line: number}}}>} blocks
 * @param {Array<string>} lines - linhas do documento
 * @param {number} cursorLine - linha 0-based do cursor
 * @returns {string|null}
 */
function resolveBibref(blocks, lines, cursorLine) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return null;
    }

    const ordered = blocks
        .filter(b => b && b.range && b.range.start && b.range.end)
        .slice()
        .sort((a, b) => a.range.start.line - b.range.start.line);

    if (ordered.length === 0) {
        return null;
    }

    // 1) Cobertura exata — o cursor está dentro de um bloco.
    for (const block of ordered) {
        if (cursorLine >= block.range.start.line && cursorLine <= block.range.end.line) {
            return block.bibref || null;
        }
    }

    // 2) Gap de comentários/linhas em branco → o bloco SEGUINTE.
    const next = ordered.find(b => b.range.start.line > cursorLine);
    if (next && isNeutralGap(lines, cursorLine, next.range.start.line)) {
        return next.bibref || null;
    }

    // 3) Último recurso: o último bloco que começa antes do cursor.
    let lastBefore = null;
    for (const block of ordered) {
        if (block.range.start.line <= cursorLine) {
            lastBefore = block.bibref || null;
        }
    }
    return lastBefore;
}

/**
 * Verifica se tudo entre `fromLine` (inclusive) e `toLine` (exclusive) é neutro.
 *
 * Linhas fora do array contam como neutras: um documento pode estar sendo
 * editado, e faltar uma linha não é motivo para recusar a resolução.
 */
function isNeutralGap(lines, fromLine, toLine) {
    const source = Array.isArray(lines) ? lines : [];
    for (let i = fromLine; i < toLine; i += 1) {
        if (i < 0 || i >= source.length) {
            continue;
        }
        if (!isNeutralLine(source[i])) {
            return false;
        }
    }
    return true;
}

module.exports = { resolveBibref, isNeutralLine, isNeutralGap };
