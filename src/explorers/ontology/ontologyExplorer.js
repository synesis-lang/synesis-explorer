/**
 * ontologyExplorer.js - TreeDataProvider para navegacao de topicos de ontologia
 *
 * Proposito:
 *     Lista valores definidos em campos TOPIC, ORDERED e ENUMERATED
 *     de blocos ONTOLOGY (.syno), agrupando por campo.
 *
 * Componentes principais:
 *     - refresh: Escaneia workspace e atualiza indice de topicos
 *     - getChildren: Hierarquia (campo -> topico -> ocorrencias)
 *
 * Dependencias criticas:
 *     - TemplateManager: carregamento do template para identificar TOPIC
 *     - OntologyParser: parse de blocos ONTOLOGY em .syno
 */

const vscode = require('vscode');
const OntologyParser = require('../../parsers/ontologyParser');
const FieldRegistry = require('../../core/fieldRegistry');

class OntologyExplorer {
    constructor(workspaceScanner, templateManager) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.parser = new OntologyParser();
        this.fieldValues = new Map(); // fieldName -> Map(value -> {occurrences, sortKey})
        this.fieldTypes = new Map(); // fieldName -> type
        this.fieldValueDefinitions = new Map(); // fieldName -> {byIndex, byLabel}
        this.filterText = '';

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Escaneia workspace e atualiza indice de topicos
     */
    async refresh() {
        this.fieldValues.clear();
        this.fieldTypes.clear();
        this.fieldValueDefinitions.clear();

        try {
            const projectUri = await this.scanner.findProjectFile();
            if (!projectUri) {
                await this._setHasTopics(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const registry = await this.templateManager.loadTemplate(projectUri);
            const fieldRegistry = new FieldRegistry(registry);
            const topicFields = fieldRegistry.getTopicFields();
            const orderedFields = fieldRegistry.getOrderedFields();
            const enumeratedFields = fieldRegistry.getEnumeratedFields();
            const fieldTypes = new Map();

            for (const name of topicFields) {
                fieldTypes.set(name, 'TOPIC');
            }
            for (const name of orderedFields) {
                fieldTypes.set(name, 'ORDERED');
            }
            for (const name of enumeratedFields) {
                fieldTypes.set(name, 'ENUMERATED');
            }

            this.fieldTypes = fieldTypes;
            this.fieldValueDefinitions = this._buildFieldValueDefinitions(registry, fieldTypes);
            const hasTopics = fieldTypes.size > 0;

            await this._setHasTopics(hasTopics);
            if (!hasTopics) {
                this._onDidChangeTreeData.fire();
                return;
            }

            const synoFiles = await this.scanner.findSynoFiles();
            for (const fileUri of synoFiles) {
                await this._scanFile(fileUri, fieldTypes);
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning ontology topics:', error);
            await this._setHasTopics(false);
            vscode.window.showErrorMessage(`Failed to scan ontology topics: ${error.message}`);
        }
    }

    /**
     * Escaneia um arquivo .syno individual
     * @private
     */
    async _scanFile(fileUri, fieldTypes) {
        const content = await vscode.workspace.fs.readFile(fileUri);
        const text = content.toString();
        const filePath = fileUri.fsPath;

        const ontologies = this.parser.parseOntologyBlocks(text, filePath);

        for (const ontology of ontologies) {
            for (const entry of ontology.fieldEntries) {
                if (!fieldTypes.has(entry.name)) {
                    continue;
                }

                const values = this._splitFieldValues(entry.value);
                for (const value of values) {
                    const resolved = this._resolveFieldValue(entry.name, value);
                    this._addFieldValue(entry.name, resolved.displayValue, resolved.sortKey, {
                        concept: ontology.concept,
                        file: filePath,
                        line: entry.line,
                        column: entry.column,
                        field: entry.name,
                        topic: value
                    });
                }
            }
        }
    }

    _splitFieldValues(value) {
        if (!value) {
            return [];
        }

        return value
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
    }

    _addFieldValue(fieldName, fieldValue, sortKey, occurrence) {
        if (!this.fieldValues.has(fieldName)) {
            this.fieldValues.set(fieldName, new Map());
        }

        const fieldMap = this.fieldValues.get(fieldName);
        if (!fieldMap.has(fieldValue)) {
            fieldMap.set(fieldValue, {
                occurrences: [],
                sortKey
            });
        }

        fieldMap.get(fieldValue).occurrences.push(occurrence);
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const items = [];
            const filter = this.filterText;

            for (const [fieldName, topicMap] of this.fieldValues.entries()) {
                if (filter && !this._fieldHasMatch(fieldName, topicMap, filter)) {
                    continue;
                }
                items.push(new FieldTreeItem(fieldName, this.fieldTypes.get(fieldName), topicMap));
            }

            return items.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
        }

        if (element instanceof FieldTreeItem) {
            const topics = [];
            const filter = this.filterText;
            const fieldMatch = filter && element.fieldName.toLowerCase().includes(filter);

            for (const [topicValue, entry] of element.valueMap.entries()) {
                if (filter && !fieldMatch && !topicValue.toLowerCase().includes(filter)) {
                    continue;
                }
                topics.push(new ValueTreeItem(element.fieldName, topicValue, entry.occurrences, entry.sortKey));
            }

            return topics.sort((a, b) => {
                const aKey = a.sortKey;
                const bKey = b.sortKey;
                if (aKey !== null && bKey !== null && aKey !== bKey) {
                    return aKey - bKey;
                }
                if (aKey !== null && bKey === null) {
                    return -1;
                }
                if (aKey === null && bKey !== null) {
                    return 1;
                }
                return a.topicValue.localeCompare(b.topicValue);
            });
        }

        return element.occurrences.map(occ => new OccurrenceTreeItem(occ));
    }

    _fieldHasMatch(fieldName, topicMap, filter) {
        const lower = filter.toLowerCase();
        if (fieldName.toLowerCase().includes(lower)) {
            return true;
        }

        for (const topicValue of topicMap.keys()) {
            if (topicValue.toLowerCase().includes(lower)) {
                return true;
            }
        }

        return false;
    }

    async _setHasTopics(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.hasTopics', value);
    }

    /**
     * Atualiza o filtro por topico
     * @param {string} text
     */
    setFilter(text) {
        this.filterText = (text || '').trim().toLowerCase();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Retorna o filtro atual
     * @returns {string}
     */
    getFilter() {
        return this.filterText;
    }

    _buildFieldValueDefinitions(registry, fieldTypes) {
        const definitions = new Map();

        for (const [fieldName, fieldType] of fieldTypes.entries()) {
            const def = registry[fieldName];
            const values = Array.isArray(def?.values) ? def.values : [];
            if (!values.length) {
                continue;
            }

            const byIndex = new Map();
            const byLabel = new Map();

            for (const value of values) {
                const label = value && typeof value.label === 'string' ? value.label : null;
                const index = typeof value?.index === 'number' ? value.index : null;

                if (label) {
                    byLabel.set(label, { index, label });
                }

                if (index !== null && !Number.isNaN(index) && label) {
                    if (!byIndex.has(index)) {
                        byIndex.set(index, label);
                    }
                }
            }

            definitions.set(fieldName, {
                fieldType,
                byIndex,
                byLabel
            });
        }

        return definitions;
    }

    _resolveFieldValue(fieldName, rawValue) {
        const text = String(rawValue || '').trim();
        const fieldType = this.fieldTypes.get(fieldName);
        const definition = this.fieldValueDefinitions.get(fieldName);
        const numericValue = this._parseNumericValue(text);
        let index = null;
        let label = text;

        if (definition) {
            if (numericValue !== null && definition.byIndex.has(numericValue)) {
                index = numericValue;
                label = definition.byIndex.get(numericValue);
            } else if (definition.byLabel.has(text)) {
                const entry = definition.byLabel.get(text);
                label = entry.label;
                if (entry.index !== null && entry.index !== undefined) {
                    index = entry.index;
                }
            } else if (numericValue !== null && (fieldType === 'ORDERED' || fieldType === 'ENUMERATED')) {
                index = numericValue;
            }
        } else if (numericValue !== null && (fieldType === 'ORDERED' || fieldType === 'ENUMERATED')) {
            index = numericValue;
        }

        const displayValue = index !== null ? `[${index}] ${label}` : label;
        return { displayValue, sortKey: index };
    }

    _parseNumericValue(text) {
        if (!text || !/^\d+$/.test(text)) {
            return null;
        }

        const parsed = Number.parseInt(text, 10);
        return Number.isNaN(parsed) ? null : parsed;
    }
}

class FieldTreeItem extends vscode.TreeItem {
    constructor(fieldName, fieldType, valueMap) {
        super(fieldName, vscode.TreeItemCollapsibleState.Collapsed);

        this.fieldName = fieldName;
        this.fieldType = fieldType || '';
        this.valueMap = valueMap;
        this.description = `${this.fieldType} (${valueMap.size} value(s))`;
        this.iconPath = new vscode.ThemeIcon('organization');
        this.contextValue = 'ontologyTopicField';
    }
}

class ValueTreeItem extends vscode.TreeItem {
    constructor(fieldName, topicValue, occurrences, sortKey) {
        super(topicValue, vscode.TreeItemCollapsibleState.Collapsed);

        this.fieldName = fieldName;
        this.topicValue = topicValue;
        this.occurrences = occurrences;
        this.sortKey = typeof sortKey === 'number' ? sortKey : null;
        this.description = `${occurrences.length} concept(s)`;
        this.iconPath = new vscode.ThemeIcon('graph');
        this.contextValue = 'ontologyTopicValue';
    }
}

class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        super(occurrence.concept, vscode.TreeItemCollapsibleState.None);

        this.iconPath = new vscode.ThemeIcon('symbol-constant');
        this.contextValue = 'ontologyTopicOccurrence';
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [occurrence.file, occurrence.line, occurrence.column]
        };
    }
}

module.exports = OntologyExplorer;
