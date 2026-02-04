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

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFieldValueInfo(blockContent, fieldName) {
    const escapedName = escapeRegex(fieldName);
    const pattern = new RegExp(
        `^\\s*${escapedName}\\s*:\\s*([\\s\\S]*?)(?=^\\s*[\\p{L}\\p{N}._-]+\\s*:|\\s*(?![\\s\\S]))`,
        'gmu'
    );

    const match = pattern.exec(blockContent);
    if (!match) {
        return null;
    }

    const value = match[1];
    const valueStart = match.index + match[0].length - value.length;
    return { value, valueStart };
}

function findTokenOffset(value, token) {
    const escaped = escapeRegex(token);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}._-])(${escaped})(?=$|[^\\p{L}\\p{N}._-])`, 'u');
    const match = pattern.exec(value);
    if (!match) {
        return null;
    }
    return match.index + match[1].length;
}

function findTokenPosition(item, fieldName, token, lineOffsets) {
    if (!item.blockContent || typeof item.blockOffset !== 'number') {
        return null;
    }

    const fieldInfo = findFieldValueInfo(item.blockContent, fieldName);
    if (!fieldInfo) {
        return null;
    }

    const tokenOffset = findTokenOffset(fieldInfo.value, token);
    if (tokenOffset === null) {
        return null;
    }

    const absoluteOffset = item.blockOffset + fieldInfo.valueStart + tokenOffset;
    return getLineColumn(lineOffsets, absoluteOffset);
}

module.exports = {
    buildLineOffsets,
    getLineColumn,
    findTokenPosition,
    findFieldValueInfo,
    findTokenOffset
};
