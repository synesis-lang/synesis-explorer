/**
 * bibtexParser.js - Parser de arquivos BibTeX
 *
 * Proposito:
 *     Carrega entradas BibTeX e fornece helpers de busca.
 *
 * Componentes principais:
 *     - parse: Retorna entries BibTeX
 *     - findEntry: Busca entry por bibref
 *     - getAbstract: Extrai o abstract do entry
 */

const fs = require('fs');
const bibtexParse = require('bibtex-parse-js');

/**
 * Parseia arquivo .bib e retorna entries
 * @param {string} bibPath
 * @returns {Promise<Array>}
 */
async function parse(bibPath) {
    const content = await fs.promises.readFile(bibPath, 'utf-8');
    return bibtexParse.toJSON(content);
}

/**
 * Busca entry por bibref
 * @param {Array} entries
 * @param {string} bibref
 * @returns {Object|null}
 */
function findEntry(entries, bibref) {
    if (!Array.isArray(entries)) {
        return null;
    }

    const key = normalizeKey(bibref);
    if (!key) {
        return null;
    }

    return entries.find(entry => normalizeKey(entry.citationKey) === key) || null;
}

/**
 * Extrai abstract de um entry
 * @param {Object} entry
 * @returns {string|null}
 */
function getAbstract(entry) {
    return entry?.entryTags?.abstract || null;
}

function normalizeKey(value) {
    const text = String(value || '').trim();
    const match = text.match(/[\p{L}\p{N}._-]+/u);
    return match ? match[0].toLowerCase() : '';
}

module.exports = {
    parse,
    findEntry,
    getAbstract
};
