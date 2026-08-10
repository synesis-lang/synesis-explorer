/**
 * itemCardBuilder.js - Montagem de cards de ITEM para o abstractViewer
 *
 * Propósito:
 *     Converte items normalizados (vindos do LSP ou do parser local) em cards
 *     de exibição — um card por bloco ITEM, com TODOS os campos do template.
 *
 * Por que existe como módulo separado:
 *     1. `_buildExcerptsFromLspItems` e `_extractExcerptsLocal` no abstractViewer
 *        eram quase idênticos: toda correção precisava ser feita duas vezes, e a
 *        divergência entre eles era questão de tempo.
 *     2. Sem dependência de `vscode`, é testável em unidade — mesmo padrão de
 *        `src/lsp/sharedWatchTargets.js`.
 *
 * Contrato de entrada (NormalizedItem):
 *     { fields: {nomeMinusculo: valor}, codes: [], chains: [], line, file }
 *
 * Contrato de saída (ItemCard):
 *     { excerpt: {field, value}|null, chains: [], codes: [],
 *       fields: [{name, label, type, values, isMultiple}], line, file }
 */

'use strict';

// Campos com tratamento visual dedicado no card; os demais caem em `fields`.
const SPECIAL_TYPES = new Set(['QUOTATION', 'MEMO', 'CHAIN', 'CODE']);

/**
 * Normaliza espaços em branco de um valor textual.
 */
function normalizeText(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

/**
 * Converte um valor de campo (escalar ou array) em lista de strings normalizadas.
 */
function toValueList(raw) {
    if (raw == null) {
        return [];
    }

    const list = Array.isArray(raw) ? raw : [raw];
    const values = [];
    for (const entry of list) {
        const normalized = normalizeText(entry);
        if (normalized) {
            values.push(normalized);
        }
    }
    return values;
}

/**
 * Nomes de campos do registry que têm um dado tipo.
 */
function fieldsOfType(registry, type) {
    return Object.entries(registry || {})
        .filter(([, def]) => def && def.type === type)
        .map(([name]) => name);
}

/**
 * Decide, a partir do template, o papel visual de cada tipo de campo.
 *
 * Regra de excerpt: QUOTATION é o trecho citado. Sem QUOTATION, MEMO assume esse
 * papel (e deixa de ser exibido como nota, para não duplicar).
 */
function buildDisplayPlan(registry) {
    const quotationFields = fieldsOfType(registry, 'QUOTATION');
    const memoFields = fieldsOfType(registry, 'MEMO');
    const chainFields = fieldsOfType(registry, 'CHAIN');
    const codeFields = fieldsOfType(registry, 'CODE');

    const useMemoAsExcerpt = quotationFields.length === 0 && memoFields.length > 0;
    const excerptFields = quotationFields.length > 0
        ? quotationFields
        : (useMemoAsExcerpt ? memoFields : []);

    return {
        excerptFields,
        memoFields: useMemoAsExcerpt ? [] : memoFields,
        chainFields,
        codeFields,
        // Ao contrário da versão anterior, codes NÃO são suprimidos quando há
        // chain: um template com CHAIN e CODE é o caso comum, e os códigos
        // simplesmente desapareciam da tela.
        showCodes: codeFields.length > 0,
        showChain: chainFields.length > 0
    };
}

/**
 * Rótulo legível de um campo. A description do template é o que traduz `zone`
 * para "Zona retórica do trecho" — o propósito didático desta view.
 */
function fieldLabel(name, def) {
    const description = def && def.description ? normalizeText(def.description) : '';
    if (!description) {
        return name;
    }
    // Descrições longas viram tooltip, não rótulo.
    return description.length <= 60 ? description : name;
}

/**
 * Ordem de exibição: a do template, não a do dict do item.
 * Mantém o card como espelho do template entre ITEMs e entre execuções.
 */
function orderedFieldNames(registry, itemFields) {
    const templateOrder = Object.keys(registry || {});
    const seen = new Set();
    const ordered = [];

    for (const name of templateOrder) {
        const key = name.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            ordered.push(name);
        }
    }

    // Campos presentes no item mas ausentes do registry (ex.: template
    // desatualizado) entram no fim, em vez de sumirem.
    for (const key of Object.keys(itemFields || {})) {
        if (!seen.has(key)) {
            seen.add(key);
            ordered.push(key);
        }
    }

    return ordered;
}

/**
 * Constrói um card por ITEM.
 *
 * Substitui o pareamento note[i] × chain[i] da versão anterior, que multiplicava
 * um ITEM em N cards e inventava uma correspondência inexistente entre listas
 * independentes. Um ITEM = um card torna o contador conferível contra o número
 * de blocos ITEM no .syn.
 *
 * @param {Array<Object>} items - Items normalizados
 * @param {Object} registry - Field registry do template
 * @returns {{cards: Array<Object>, display: Object}}
 */
function buildItemCards(items, registry) {
    const plan = buildDisplayPlan(registry);
    const cards = [];

    for (const item of items || []) {
        const itemFields = item.fields || {};

        // Excerpt: primeiro campo de excerpt com valor
        let excerpt = null;
        for (const fieldName of plan.excerptFields) {
            const values = toValueList(itemFields[fieldName.toLowerCase()]);
            if (values.length > 0) {
                excerpt = { field: fieldName, value: values[0] };
                break;
            }
        }

        // Chains: do campo do template; se vazio, do payload estruturado do LSP
        let chains = [];
        for (const fieldName of plan.chainFields) {
            chains = chains.concat(toValueList(itemFields[fieldName.toLowerCase()]));
        }
        if (chains.length === 0 && Array.isArray(item.chains)) {
            chains = toValueList(item.chains);
        }

        // Codes: campos CODE são listas separadas por vírgula
        let codes = [];
        if (plan.showCodes) {
            for (const fieldName of plan.codeFields) {
                for (const value of toValueList(itemFields[fieldName.toLowerCase()])) {
                    for (const part of value.split(',')) {
                        const code = part.trim();
                        if (code && !codes.includes(code)) {
                            codes.push(code);
                        }
                    }
                }
            }
            if (codes.length === 0 && Array.isArray(item.codes)) {
                for (const code of toValueList(item.codes)) {
                    if (!codes.includes(code)) {
                        codes.push(code);
                    }
                }
            }
        }

        // Demais campos: TODOS os que não têm tratamento dedicado.
        // A versão anterior filtrava por 4 tipos e descartava o resto — ENUMERATED,
        // SCALE, ORDERED e TEXT nunca chegavam à tela.
        const excerptFieldKey = excerpt ? excerpt.field.toLowerCase() : null;
        const fields = [];

        for (const name of orderedFieldNames(registry, itemFields)) {
            const key = name.toLowerCase();
            const def = (registry && (registry[name] || registry[key])) || {};
            const type = def.type || '';

            if (key === excerptFieldKey) {
                continue;
            }
            if (SPECIAL_TYPES.has(type)) {
                // MEMO só entra aqui quando não virou excerpt (ver buildDisplayPlan)
                const isVisibleMemo = type === 'MEMO'
                    && plan.memoFields.some(f => f.toLowerCase() === key);
                if (!isVisibleMemo) {
                    continue;
                }
            }

            const values = toValueList(itemFields[key]);
            if (values.length === 0) {
                continue;
            }

            fields.push({
                name,
                label: fieldLabel(name, def),
                description: def.description ? normalizeText(def.description) : '',
                type,
                values,
                isMultiple: values.length > 1
            });
        }

        // Um ITEM sem conteúdo algum não vira card
        if (!excerpt && chains.length === 0 && codes.length === 0 && fields.length === 0) {
            continue;
        }

        cards.push({
            excerpt,
            chains,
            codes,
            fields,
            line: item.line || 0,
            file: item.file || ''
        });
    }

    return {
        cards,
        display: {
            showChain: plan.showChain,
            showCodes: plan.showCodes,
            chainCount: cards.reduce((sum, card) => sum + card.chains.length, 0)
        }
    };
}

module.exports = {
    buildItemCards,
    buildDisplayPlan,
    normalizeText,
    toValueList,
    fieldsOfType,
    orderedFieldNames
};
