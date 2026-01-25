/**
 * positionUtils.js - Helpers para conversao de offsets em posicoes
 *
 * Proposito:
 *     Converte offsets absolutos em linha/coluna usando cache de linhas.
 *
 * Componentes principais:
 *     - buildLineOffsets: Cria indices de inicio de linha
 *     - getLineColumn: Calcula linha e coluna a partir do offset
 */

function buildLineOffsets(text) {
    const offsets = [0];

    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '\n') {
            offsets.push(index + 1);
        }
    }

    return offsets;
}

function getLineColumn(lineOffsets, offset) {
    if (!Array.isArray(lineOffsets) || lineOffsets.length === 0) {
        return { line: 0, column: 0 };
    }

    let target = Math.max(0, offset);
    let line = 0;

    while (line + 1 < lineOffsets.length && lineOffsets[line + 1] <= target) {
        line += 1;
    }

    const column = target - lineOffsets[line];
    return { line, column };
}

module.exports = {
    buildLineOffsets,
    getLineColumn
};
