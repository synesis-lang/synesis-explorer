/**
 * fieldRegistry.js - Helpers para field definitions do template
 *
 * Proposito:
 *     Fornece lookup e filtros de fields carregados do template.
 *
 * Componentes principais:
 *     - getCodeFields: Lista campos do tipo CODE
 *     - getChainFields: Lista campos do tipo CHAIN
 *     - isCodeField/isChainField: Checks por nome
 */

class FieldRegistry {
    constructor(fields) {
        this.fields = fields || {};
    }

    getCodeFields() {
        return Object.entries(this.fields)
            .filter(([, def]) => def.type === 'CODE')
            .map(([name]) => name);
    }

    getChainFields() {
        return Object.entries(this.fields)
            .filter(([, def]) => def.type === 'CHAIN')
            .map(([name]) => name);
    }

    getTopicFields() {
        return Object.entries(this.fields)
            .filter(([, def]) => def.type === 'TOPIC' && def.scope === 'ONTOLOGY')
            .map(([name]) => name);
    }

    getOrderedFields() {
        return Object.entries(this.fields)
            .filter(([, def]) => def.type === 'ORDERED' && def.scope === 'ONTOLOGY')
            .map(([name]) => name);
    }

    getEnumeratedFields() {
        return Object.entries(this.fields)
            .filter(([, def]) => def.type === 'ENUMERATED' && def.scope === 'ONTOLOGY')
            .map(([name]) => name);
    }

    isCodeField(name) {
        return this.fields[name]?.type === 'CODE';
    }

    isChainField(name) {
        return this.fields[name]?.type === 'CHAIN';
    }

    isTopicField(name) {
        return this.fields[name]?.type === 'TOPIC' && this.fields[name]?.scope === 'ONTOLOGY';
    }

    getFieldDef(name) {
        return this.fields[name] || null;
    }

    hasRelations(name) {
        const def = this.fields[name];
        return def?.type === 'CHAIN' && Array.isArray(def.relations);
    }
}

module.exports = FieldRegistry;
