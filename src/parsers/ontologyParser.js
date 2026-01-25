/**
 * ontologyParser.js - Parser simplificado de arquivos .syno
 *
 * Proposito:
 *     Parseia blocos ONTOLOGY para extrair conceitos e campos.
 *     Suporta campos repetidos e valores multilinha.
 *
 * Componentes principais:
 *     - parseOntologyBlocks: Extrai blocos ONTOLOGY com campos e localizacao
 *
 * Dependencias criticas:
 *     - Nenhuma (regex e parsing manual)
 */

class OntologyParser {
    /**
     * Parseia blocos ONTOLOGY de um arquivo .syno
     * @param {string} content - Conteudo do arquivo
     * @param {string} filePath - Caminho do arquivo
     * @returns {Array<OntologyBlock>}
     *
     * OntologyBlock: {
     *   concept: string,
     *   fields: Object (field_name -> value|Array),
     *   fieldEntries: Array<{name, value, line, column}>,
     *   line: number,
     *   file: string,
     *   blockContent: string,
     *   blockOffset: number,
     *   startOffset: number,
     *   endOffset: number
     * }
     */
    parseOntologyBlocks(content, filePath) {
        const blocks = [];

        // Regex: ONTOLOGY <concept> ... END ONTOLOGY
        const ontologyPattern = /ONTOLOGY\s+([^\s#\n\r][^#\n\r]*)(.*?)END\s+ONTOLOGY/gsu;

        let match;
        while ((match = ontologyPattern.exec(content)) !== null) {
            const concept = match[1].trim();
            const blockContent = match[2];
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const blockOffset = match.index + match[0].indexOf(blockContent);
            const line = this._getLineNumber(content, match.index);

            const parsed = this._parseFieldEntries(blockContent, line);

            blocks.push({
                concept,
                fields: parsed.fields,
                fieldEntries: parsed.entries,
                line,
                file: filePath,
                blockContent,
                blockOffset,
                startOffset,
                endOffset
            });
        }

        return blocks;
    }

    /**
     * Extrai campos de um bloco ONTOLOGY
     * @private
     * @param {string} blockContent
     * @param {number} baseLine
     * @returns {{fields: Object, entries: Array}}
     */
    _parseFieldEntries(blockContent, baseLine) {
        const fields = {};
        const entries = [];
        const lines = blockContent.split('\n');

        let currentField = null;
        let currentValue = [];
        let currentLine = baseLine;
        let currentColumn = 0;

        const commitField = () => {
            if (!currentField) {
                return;
            }
            const value = currentValue.join('\n').trim();
            if (value !== '') {
                this._addField(fields, currentField, value);
                entries.push({
                    name: currentField,
                    value,
                    line: currentLine,
                    column: currentColumn
                });
            }
            currentField = null;
            currentValue = [];
        };

        for (let index = 0; index < lines.length; index += 1) {
            const rawLine = lines[index];
            const trimmed = rawLine.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const fieldMatch = trimmed.match(/^([\p{L}\p{N}._-]+)\s*:\s*(.*)$/u);

            if (fieldMatch) {
                commitField();
                currentField = fieldMatch[1];
                currentValue = [fieldMatch[2]];
                currentLine = baseLine + index;
                const column = rawLine.indexOf(fieldMatch[1]);
                currentColumn = column >= 0 ? column : 0;
                continue;
            }

            if (currentField) {
                currentValue.push(trimmed);
            }
        }

        commitField();
        return { fields, entries };
    }

    _addField(fields, name, value) {
        if (Object.prototype.hasOwnProperty.call(fields, name)) {
            const existing = fields[name];
            if (Array.isArray(existing)) {
                existing.push(value);
            } else {
                fields[name] = [existing, value];
            }
        } else {
            fields[name] = value;
        }
    }

    /**
     * Calcula numero da linha a partir de um offset no conteudo
     * @private
     */
    _getLineNumber(content, offset) {
        const beforeMatch = content.substring(0, offset);
        return beforeMatch.split('\n').length - 1;
    }
}

module.exports = OntologyParser;
