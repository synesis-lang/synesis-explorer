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
        // Hífen de quebra de linha: `socio-\neconomic` no PDF é `socioeconomic`
        // para quem digitou o excerpt. Sem descartar o par, o \n vira espaço e
        // separa as metades — o trecho nunca é localizado.
        if (text[index] === '-' && isLineBreakAt(text, index + 1)) {
            index += text[index + 1] === '\r' ? 2 : 1;
            continue;
        }

        const char = foldChar(text[index]);
        if (!char) {
            // Era uma marca combinante isolada (o acento de um `a` decomposto,
            // já absorvido pela letra anterior).
            continue;
        }

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

/** Marcas combinantes Unicode (acentos que seguem a letra base em NFD). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Reduz um caractere à sua forma comparável: decompõe e descarta o acento.
 *
 * O abstract vem do .bib (frequentemente extraído de PDF) e o excerpt é
 * digitado pelo pesquisador — os dois lados divergem em forma Unicode. `ç` pode
 * ser um caractere (NFC) ou dois (NFD: `c` + cedilha), e as duas grafias nunca
 * casavam.
 *
 * Por que NFD + remoção de marcas, e não `normalize('NFC')`: compor exigiria
 * olhar mais de um caractere por vez, enquanto o `map` de posições precisa de
 * uma entrada por índice do texto ORIGINAL — é ele que faz o destaque cair no
 * lugar certo. Normalizar a string inteira e depois indexar deslocaria todos os
 * destaques. Decompor e descartar preserva a correspondência 1:1: cada caractere
 * ou vira uma entrada, ou desaparece por ser um acento já absorvido.
 *
 * Efeito colateral aceito: a busca fica insensível a acentos (`crítico` casa com
 * `critico`). Para localizar um trecho citado isso é desejável — o acento
 * costuma ser exatamente o que se perde na extração do PDF.
 *
 * @param {string} char
 * @returns {string} caractere dobrado, ou '' se era só uma marca combinante
 */
function foldChar(char) {
    const folded = char.normalize('NFD').replace(COMBINING_MARKS, '');
    return folded ? folded[0] : '';
}

/** Há uma quebra de linha (LF ou CRLF) na posição `index`? */
function isLineBreakAt(text, index) {
    const char = text[index];
    if (char === '\n') {
        return true;
    }
    return char === '\r' && text[index + 1] === '\n';
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
