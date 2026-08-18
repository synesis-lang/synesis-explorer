/**
 * referenceHash.js - Hash de cache das referências do ReferenceExplorer
 *
 * Propósito:
 *     Resume o payload de `getReferences` numa string curta, usada por
 *     `ReferenceExplorer.refresh()` para decidir se a árvore precisa ser
 *     reconstruída.
 *
 * Por que inclui file:line (e por que existe como módulo separado):
 *     A versão anterior resumia o estado em `count:first:occCount` — quantidade
 *     de referências, nome da primeira e total de ocorrências. Nenhum desses
 *     números muda quando um bloco apenas se desloca no arquivo. Inserir
 *     comentários, linhas em branco ou reescrever a prosa de um `note` produzia
 *     o mesmo hash: `refresh()` abortava, a árvore mantinha as linhas antigas e
 *     clicar numa referência levava ao bloco errado — tipicamente ao meio do
 *     ITEM anterior, com deriva cumulativa a cada edição.
 *
 *     `ontologyExplorer._flattenTopics` já usava `name:file:line:level` e é
 *     imune ao defeito; este módulo segue o mesmo princípio. Sem dependência de
 *     `vscode`, é testável em unidade — mesmo padrão de `sharedWatchTargets.js`.
 */

'use strict';

/**
 * Hash FNV-1a de 32 bits.
 *
 * O resumo precisa ter tamanho constante: ele é recalculado e comparado a cada
 * refresh, e concatenar file:line de todas as ocorrências de um projeto grande
 * produziria uma string proporcional ao acervo.
 *
 * @param {string} text
 * @returns {number} inteiro sem sinal de 32 bits
 */
function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Resume as referências, incluindo a localização de cada ocorrência.
 *
 * @param {Array<{bibref: string, itemCount: number, occurrences: Array<{file: string, line: number}>}>} refs
 * @returns {string} 'empty' para lista vazia; caso contrário `<n>:<hash>`
 */
function hashReferences(refs) {
    if (!refs || refs.length === 0) {
        return 'empty';
    }

    const parts = [];
    for (const ref of refs) {
        const bibref = String((ref && ref.bibref) || '');
        const itemCount = (ref && typeof ref.itemCount === 'number') ? ref.itemCount : 0;
        const occurrences = (ref && Array.isArray(ref.occurrences)) ? ref.occurrences : [];

        const locations = occurrences
            .map(occ => `${(occ && occ.file) || ''}:${(occ && occ.line) != null ? occ.line : ''}`)
            .join(',');

        parts.push(`${bibref}|${itemCount}|${locations}`);
    }

    return `${refs.length}:${fnv1a(parts.join(';'))}`;
}

module.exports = { hashReferences, fnv1a };
