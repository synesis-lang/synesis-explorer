/**
 * chainParser.js - Parser de expressoes CHAIN
 *
 * Proposito:
 *     Extrai codigos e relacoes de cadeias em campos CHAIN.
 *     Diferencia chains qualificadas e simples.
 */

/**
 * Parseia uma cadeia e retorna codigos e relacoes
 * @param {string} chainText
 * @param {Object} fieldDef
 * @returns {Object}
 */
function parseChain(chainText, fieldDef) {
    const text = (chainText || '').trim();
    if (!text) {
        return { codes: [], relations: [], type: 'simple' };
    }

    const elements = text.split('->').map(item => item.trim()).filter(Boolean);
    const hasRelations = Array.isArray(fieldDef?.relations) && fieldDef.relations.length > 0;

    if (hasRelations) {
        const codes = elements.filter((_, index) => index % 2 === 0);
        const relations = elements.filter((_, index) => index % 2 === 1);
        return { codes, relations, type: 'qualified' };
    }

    const codes = elements;
    const relations = Array(Math.max(codes.length - 1, 0)).fill('relates_to');
    return { codes, relations, type: 'simple' };
}

module.exports = {
    parseChain
};
