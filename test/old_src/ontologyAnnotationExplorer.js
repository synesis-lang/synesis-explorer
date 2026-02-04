/**
 * ontologyAnnotationExplorer.js - TreeDataProvider para ontologia em anotacoes
 *
 * Proposito:
 *     Lista valores de TOPIC, ORDERED e ENUMERATED definidos na ontologia
 *     apenas para conceitos usados no arquivo .syn ativo.
 *
 * Componentes principais:
 *     - refresh: Reconstroi indice para o .syn ativo
 *     - getChildren: Hierarquia (campo -> valor -> conceito)
 *
 * Dependencias criticas:
 *     - TemplateManager: campos ONTOLOGY do template
 *     - projectLoader: includes ONTOLOGY do .synp
 *     - OntologyParser: parse de .syno
 *     - SynesisParser: parse de ITEMs no .syn
 *     - chainParser: extracao de codigos em CHAIN
 */

const vscode = require('vscode');
const OntologyParser = require('../../parsers/ontologyParser');
const SynesisParser = require('../../parsers/synesisParser');
const FieldRegistry = require('../../core/fieldRegistry');
const projectLoader = require('../../core/projectLoader');
const chainParser = require('../../parsers/chainParser');
const positionUtils = require('../../utils/positionUtils');

class OntologyAnnotationExplorer {
    constructor(workspaceScanner, templateManager) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.synParser = new SynesisParser();
        this.ontologyParser = new OntologyParser();
        this.fieldValues = new Map(); // fieldName -> Map(value -> {sortKey, concepts})
        this.fieldTypes = new Map(); // fieldName -> type
        this.fieldValueDefinitions = new Map(); // fieldName -> {byIndex, byLabel}

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /**
     * Reconstroi indice para o arquivo .syn ativo
     */
    async refresh() {
        this.fieldValues.clear();
        this.fieldTypes.clear();
        this.fieldValueDefinitions.clear();

        try {
            const activeEditor = vscode.window.activeTextEditor;
            const document = activeEditor ? activeEditor.document : null;
            if (!this._isSynDocument(document)) {
                await this._setHasOntologyAnnotations(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const projectUri = await this.scanner.findProjectFile();
            if (!projectUri) {
                await this._setHasOntologyAnnotations(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const registry = await this.templateManager.loadTemplate(projectUri);
            const fieldRegistry = new FieldRegistry(registry);
            const fieldTypes = new Map();

            for (const name of fieldRegistry.getTopicFields()) {
                fieldTypes.set(name, 'TOPIC');
            }
            for (const name of fieldRegistry.getOrderedFields()) {
                fieldTypes.set(name, 'ORDERED');
            }
            for (const name of fieldRegistry.getEnumeratedFields()) {
                fieldTypes.set(name, 'ENUMERATED');
            }

            this.fieldTypes = fieldTypes;
            this.fieldValueDefinitions = this._buildFieldValueDefinitions(registry, fieldTypes);

            if (fieldTypes.size === 0) {
                await this._setHasOntologyAnnotations(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const ontologyIndex = await this._loadOntologyIndex(projectUri);
            if (ontologyIndex.size === 0) {
                await this._setHasOntologyAnnotations(false);
                this._onDidChangeTreeData.fire();
                return;
            }

            const text = document.getText();
            const filePath = document.uri.fsPath;
            const usageIndex = this._collectAnnotationOccurrences(text, filePath, registry);

            for (const [normCode, occurrences] of usageIndex.entries()) {
                const ontology = ontologyIndex.get(normCode);
                if (!ontology) {
                    continue;
                }

                for (const fieldName of fieldTypes.keys()) {
                    const rawValues = this._extractOntologyValues(ontology.fields[fieldName]);
                    for (const rawValue of rawValues) {
                        const resolved = this._resolveFieldValue(fieldName, rawValue);
                        this._addFieldValue(
                            fieldName,
                            resolved.displayValue,
                            resolved.sortKey,
                            ontology.concept,
                            occurrences
                        );
                    }
                }
            }

            await this._setHasOntologyAnnotations(this.fieldValues.size > 0);
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error scanning ontology annotations:', error);
            await this._setHasOntologyAnnotations(false);
            vscode.window.showErrorMessage(`Failed to scan ontology annotations: ${error.message}`);
        }
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const items = [];
            for (const [fieldName, valueMap] of this.fieldValues.entries()) {
                items.push(new FieldTreeItem(fieldName, this.fieldTypes.get(fieldName), valueMap));
            }
            return items.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
        }

        if (element instanceof FieldTreeItem) {
            const values = [];
            for (const [value, entry] of element.valueMap.entries()) {
                values.push(new ValueTreeItem(value, entry.sortKey, entry.concepts));
            }
            return values.sort((a, b) => {
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
                return a.label.localeCompare(b.label);
            });
        }

        if (element instanceof ValueTreeItem) {
            const concepts = [];
            for (const [concept, occurrences] of element.concepts.entries()) {
                concepts.push(new ConceptTreeItem(concept, occurrences));
            }
            return concepts.sort((a, b) => a.label.localeCompare(b.label));
        }

        if (element instanceof ConceptTreeItem) {
            return element.occurrences.map((occurrence, index) => new OccurrenceTreeItem(occurrence, index + 1));
        }

        return [];
    }

    _isSynDocument(document) {
        if (!document || !document.uri) {
            return false;
        }
        return document.uri.fsPath.toLowerCase().endsWith('.syn');
    }

    async _setHasOntologyAnnotations(value) {
        await vscode.commands.executeCommand('setContext', 'synesis.hasOntologyAnnotations', value);
    }

    async _loadOntologyIndex(projectUri) {
        const index = new Map();
        const project = await projectLoader.load(projectUri);
        const ontologyIncludes = Array.isArray(project.includes)
            ? project.includes.filter(include => include.type === 'ONTOLOGY')
            : [];

        const files = new Map();
        for (const include of ontologyIncludes) {
            const absolutePath = include.absolutePath;
            if (!absolutePath) {
                continue;
            }

            const globPath = this._normalizeGlobPath(absolutePath);
            const hasGlob = /[*?[\]]/.test(globPath);

            if (hasGlob) {
                const matches = await vscode.workspace.findFiles(globPath, '**/node_modules/**');
                for (const match of matches) {
                    files.set(match.fsPath, match);
                }
                continue;
            }

            const uri = vscode.Uri.file(absolutePath);
            try {
                await vscode.workspace.fs.stat(uri);
                files.set(uri.fsPath, uri);
            } catch (error) {
                console.warn('Ontology include not found:', absolutePath);
            }
        }

        for (const fileUri of files.values()) {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = content.toString();
            const filePath = fileUri.fsPath;
            const ontologies = this.ontologyParser.parseOntologyBlocks(text, filePath);

            for (const ontology of ontologies) {
                const normCode = this._normalizeCode(ontology.concept);
                if (!index.has(normCode)) {
                    index.set(normCode, ontology);
                }
            }
        }

        return index;
    }

    _normalizeGlobPath(value) {
        if (!value) {
            return '';
        }
        return value.replace(/\\/g, '/');
    }

    _collectAnnotationOccurrences(text, filePath, registry) {
        const occurrences = new Map();
        const fieldRegistry = new FieldRegistry(registry);
        const codeFields = fieldRegistry.getCodeFields();
        const chainFields = fieldRegistry.getChainFields();
        const items = this.synParser.parseItems(text, filePath);
        const lineOffsets = positionUtils.buildLineOffsets(text);

        for (const item of items) {
            for (const fieldName of codeFields) {
                const raw = item.fields[fieldName];
                if (!raw) {
                    continue;
                }

                const codes = this._extractCodes(raw);
                for (const code of codes) {
                    const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
                    const line = position ? position.line : item.line;
                    const column = position ? position.column : 0;
                    this._addOccurrence(occurrences, code, filePath, line, column);
                }
            }

            for (const fieldName of chainFields) {
                const raw = item.fields[fieldName];
                if (!raw) {
                    continue;
                }

                const fieldDef = registry[fieldName] || {};
                const parsed = chainParser.parseChain(raw, fieldDef);
                for (const code of parsed.codes) {
                    const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
                    const line = position ? position.line : item.line;
                    const column = position ? position.column : 0;
                    this._addOccurrence(occurrences, code, filePath, line, column);
                }
            }
        }

        return occurrences;
    }

    _addOccurrence(occurrences, code, filePath, line, column) {
        const normCode = this._normalizeCode(code);
        if (!occurrences.has(normCode)) {
            occurrences.set(normCode, []);
        }
        occurrences.get(normCode).push({
            file: filePath,
            line,
            column
        });
    }

    _extractCodes(value) {
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    _extractOntologyValues(value) {
        if (value === null || value === undefined) {
            return [];
        }

        const rawValues = Array.isArray(value) ? value : [value];
        const values = [];

        for (const raw of rawValues) {
            const text = String(raw).trim();
            if (!text) {
                continue;
            }

            for (const part of text.split(',')) {
                const trimmed = part.trim();
                if (trimmed) {
                    values.push(trimmed);
                }
            }
        }

        return values;
    }

    _addFieldValue(fieldName, displayValue, sortKey, concept, occurrences) {
        if (!this.fieldValues.has(fieldName)) {
            this.fieldValues.set(fieldName, new Map());
        }

        const fieldMap = this.fieldValues.get(fieldName);
        if (!fieldMap.has(displayValue)) {
            fieldMap.set(displayValue, {
                sortKey: typeof sortKey === 'number' ? sortKey : null,
                concepts: new Map()
            });
        }

        const entry = fieldMap.get(displayValue);
        if (!entry.concepts.has(concept)) {
            entry.concepts.set(concept, []);
        }

        const conceptOccurrences = entry.concepts.get(concept);
        for (const occ of occurrences) {
            conceptOccurrences.push(occ);
        }
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

    _normalizeCode(code) {
        return String(code || '')
            .trim()
            .split(/\s+/)
            .join(' ')
            .toLowerCase();
    }

    _findTokenPosition(item, fieldName, token, lineOffsets) {
        if (!item.blockContent || typeof item.blockOffset !== 'number') {
            return null;
        }

        const fieldInfo = this._findFieldValueInfo(item.blockContent, fieldName);
        if (!fieldInfo) {
            return null;
        }

        const tokenOffset = this._findTokenOffset(fieldInfo.value, token);
        if (tokenOffset === null) {
            return null;
        }

        const absoluteOffset = item.blockOffset + fieldInfo.valueStart + tokenOffset;
        return positionUtils.getLineColumn(lineOffsets, absoluteOffset);
    }

    _findFieldValueInfo(blockContent, fieldName) {
        const escapedName = this._escapeRegex(fieldName);
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

    _findTokenOffset(value, token) {
        const escaped = this._escapeRegex(token);
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}._-])(${escaped})(?=$|[^\\p{L}\\p{N}._-])`, 'u');
        const match = pattern.exec(value);
        if (!match) {
            return null;
        }

        return match.index + match[1].length;
    }

    _escapeRegex(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        this.contextValue = 'ontologyAnnotationField';
    }
}

class ValueTreeItem extends vscode.TreeItem {
    constructor(label, sortKey, concepts) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.label = label;
        this.sortKey = typeof sortKey === 'number' ? sortKey : null;
        this.concepts = concepts;
        this.description = `${concepts.size} factor(s)`;
        this.iconPath = new vscode.ThemeIcon('graph');
        this.contextValue = 'ontologyAnnotationValue';
    }
}

class ConceptTreeItem extends vscode.TreeItem {
    constructor(concept, occurrences) {
        super(concept, vscode.TreeItemCollapsibleState.Collapsed);

        this.occurrences = occurrences;
        this.description = `${occurrences.length} occurrence(s)`;
        this.iconPath = new vscode.ThemeIcon('symbol-constant');
        this.contextValue = 'ontologyAnnotationConcept';
    }
}

class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence, index) {
        const label = `line ${occurrence.line + 1}`;
        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = `#${index}`;
        this.iconPath = new vscode.ThemeIcon('location');
        this.contextValue = 'ontologyAnnotationOccurrence';
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [occurrence.file, occurrence.line, occurrence.column]
        };
    }
}

module.exports = OntologyAnnotationExplorer;
