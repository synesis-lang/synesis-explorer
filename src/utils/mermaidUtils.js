/**
 * mermaidUtils.js - Utilitarios para geracao de grafos Mermaid
 *
 * Extraido de graphViewer.js para reuso pelo DataService (LocalRegexProvider)
 * e pelo proprio GraphViewer.
 */

function ensureNodeId(map, name) {
    if (map.has(name)) {
        return map.get(name);
    }

    let base = String(name || '').trim().replace(/[^\p{L}\p{N}_]/gu, '_');
    if (!base) {
        base = 'node';
    }

    if (/^\d/.test(base)) {
        base = `n_${base}`;
    }

    let id = base;
    let counter = 1;
    while ([...map.values()].includes(id)) {
        counter += 1;
        id = `${base}_${counter}`;
    }

    map.set(name, id);
    return id;
}

function getNodeClass(label) {
    const text = String(label || '').toLowerCase();
    if (text.includes('enable') || text.includes('habilita')) {
        return 'enable';
    }
    if (text.includes('constrain') || text.includes('restringe')) {
        return 'constrain';
    }
    return 'node';
}

function escapeMermaidLabel(value) {
    return String(value || '').replace(/"/g, '\\"');
}

function generateMermaidGraph(reference, relations) {
    if (!relations || relations.length === 0) {
        return null;
    }

    let mermaid = 'flowchart LR\n';
    mermaid += '    classDef enable fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#166534,rx:12,ry:12\n';
    mermaid += '    classDef constrain fill:#fee2e2,stroke:#dc2626,stroke-width:3px,color:#991b1b,rx:12,ry:12\n';
    mermaid += '    classDef node fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e40af,rx:12,ry:12\n';

    const nodeIds = new Map();
    const definedNodes = new Set();

    for (const relation of relations) {
        const fromId = ensureNodeId(nodeIds, relation.from);
        const toId = ensureNodeId(nodeIds, relation.to);
        const label = escapeMermaidLabel(relation.label);
        const nodeClass = getNodeClass(relation.label);

        if (!definedNodes.has(fromId)) {
            mermaid += `    ${fromId}["${escapeMermaidLabel(relation.from)}"]:::${nodeClass}\n`;
            definedNodes.add(fromId);
        }

        if (!definedNodes.has(toId)) {
            mermaid += `    ${toId}["${escapeMermaidLabel(relation.to)}"]:::${nodeClass}\n`;
            definedNodes.add(toId);
        }

        if (label) {
            mermaid += `    ${fromId} -->|"${label}"| ${toId}\n`;
        } else {
            mermaid += `    ${fromId} --> ${toId}\n`;
        }
    }

    return mermaid;
}

module.exports = {
    generateMermaidGraph,
    ensureNodeId,
    getNodeClass,
    escapeMermaidLabel
};
