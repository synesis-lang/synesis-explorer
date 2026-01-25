/**
 * templateParser.js - Parser de arquivos .synt
 *
 * Proposito:
 *     Extrai definicoes de fields a partir de templates Synesis.
 *     Suporta TYPE, SCOPE, RELATIONS e ARITY.
 *
 * Componentes principais:
 *     - parse: Le e parseia um arquivo .synt
 *
 * Dependencias criticas:
 *     - fs: leitura de arquivos
 */

const fs = require('fs');

/**
 * Parseia um arquivo .synt e retorna field definitions
 * @param {string} templatePath
 * @returns {Promise<Object>}
 */
async function parse(templatePath) {
    const content = await fs.promises.readFile(templatePath, 'utf-8');
    const fields = [];

    const fieldPattern = /FIELD\s+([\p{L}_][\p{L}\p{N}._-]*)\s+TYPE\s+([\p{L}\p{N}_-]+)([\s\S]*?)END\s+FIELD/gu;

    let match;
    while ((match = fieldPattern.exec(content)) !== null) {
        const name = match[1];
        const type = match[2].toUpperCase();
        const body = match[3] || '';

        const field = {
            name,
            type,
            scope: extractScope(body),
            relations: extractRelations(body),
            arity: extractArity(body),
            values: extractValues(body)
        };

        fields.push(field);
    }

    return { fields };
}

function extractScope(body) {
    const match = body.match(/SCOPE\s+([\p{L}\p{N}_-]+)/u);
    return match ? match[1].toUpperCase() : 'ITEM';
}

function extractRelations(body) {
    const relMatch = body.match(/RELATIONS([\s\S]*?)END\s+RELATIONS/);
    if (!relMatch) {
        return null;
    }

    const relBody = relMatch[1];
    const relations = [];
    const lines = relBody.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const match = trimmed.match(/^([\p{L}\p{N}._-]+)\s*:/u);
        if (match) {
            relations.push(match[1]);
        }
    }

    return relations;
}

function extractArity(body) {
    const match = body.match(/ARITY\s*(>=|<=|=|>|<)\s*(\d+)/);
    if (!match) {
        return null;
    }

    return {
        operator: match[1],
        value: Number.parseInt(match[2], 10)
    };
}

function extractValues(body) {
    const valuesMatch = body.match(/VALUES([\s\S]*?)END\s+VALUES/);
    if (!valuesMatch) {
        return null;
    }

    const valuesBody = valuesMatch[1];
    const values = [];
    const lines = valuesBody.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const match = trimmed.match(/^(?:\[(\d+)\]\s*)?([\p{L}\p{N}._-]+)\s*:\s*(.+)$/u);
        if (match) {
            values.push({
                index: match[1] ? Number.parseInt(match[1], 10) : null,
                label: match[2],
                description: match[3].trim()
            });
        }
    }

    return values;
}

module.exports = {
    parse
};
