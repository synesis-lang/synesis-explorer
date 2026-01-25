/**
 * fuzzyMatcher.js - Busca aproximada de trechos em texto
 *
 * Proposito:
 *     Localiza trechos no abstract com normalizacao simples.
 *     Retorna posicoes no texto original para destaque.
 *
 * Componentes principais:
 *     - findExcerpt: Encontra posicao de um trecho
 */

function findExcerpt(abstract, excerpt) {
    if (!abstract || !excerpt) {
        return null;
    }

    const directIndex = findDirectMatch(abstract, excerpt);
    if (directIndex !== null) {
        return {
            start: directIndex,
            end: directIndex + excerpt.length
        };
    }

    const normalizedAbstract = buildNormalizedMap(abstract);
    const normalizedExcerpt = normalizeText(excerpt);
    if (!normalizedExcerpt) {
        return null;
    }

    const index = normalizedAbstract.text.indexOf(normalizedExcerpt);
    if (index === -1) {
        return null;
    }

    const endIndex = index + normalizedExcerpt.length - 1;
    const startOriginal = normalizedAbstract.map[index];
    const endOriginal = normalizedAbstract.map[endIndex];

    if (startOriginal === undefined || endOriginal === undefined) {
        return null;
    }

    return {
        start: startOriginal,
        end: endOriginal + 1
    };
}

function findDirectMatch(abstract, excerpt) {
    const index = abstract.indexOf(excerpt);
    if (index !== -1) {
        return index;
    }

    const lowerIndex = abstract.toLowerCase().indexOf(excerpt.toLowerCase());
    return lowerIndex !== -1 ? lowerIndex : null;
}

function normalizeText(text) {
    return buildNormalizedMap(text).text;
}

function buildNormalizedMap(text) {
    const normalized = [];
    const map = [];
    let lastWasSpace = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];

        if (isAlphaNumeric(char)) {
            normalized.push(char.toLowerCase());
            map.push(index);
            lastWasSpace = false;
            continue;
        }

        if (isWhitespace(char)) {
            if (!lastWasSpace) {
                normalized.push(' ');
                map.push(index);
                lastWasSpace = true;
            }
            continue;
        }
    }

    const normalizedText = normalized.join('');
    if (!normalizedText) {
        return { text: '', map: [] };
    }

    let start = 0;
    let end = normalizedText.length - 1;

    while (start <= end && normalizedText[start] === ' ') {
        start += 1;
    }

    while (end >= start && normalizedText[end] === ' ') {
        end -= 1;
    }

    if (start > end) {
        return { text: '', map: [] };
    }

    return {
        text: normalizedText.slice(start, end + 1),
        map: map.slice(start, end + 1)
    };
}

function isAlphaNumeric(char) {
    return /[\p{L}\p{N}]/u.test(char);
}

function isWhitespace(char) {
    return /\s/.test(char);
}

module.exports = {
    findExcerpt
};
