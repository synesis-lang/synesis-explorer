/**
 * synesisParser.js - Parser simplificado de arquivos Synesis
 *
 * Propósito:
 *     Parseia blocos SOURCE e ITEM de arquivos .syn usando regex.
 *     Versão simplificada para MVP (sem Lark.js devido a incompatibilidade).
 *
 * Componentes principais:
 *     - parseSourceBlocks: Extrai blocos SOURCE com bibrefs
 *     - parseItems: Extrai blocos ITEM com fields
 *     - parseFieldEntries: Extrai campos de um bloco
 *
 * Dependências críticas:
 *     - vscode.workspace: Leitura de arquivos
 *
 * Exemplo de uso:
 *     const parser = new SynesisParser();
 *     const sources = parser.parseSourceBlocks(content, filePath);
 *     const items = parser.parseItems(content, filePath);
 *
 * Notas de implementação:
 *     - Usa regex para MVP, pode ser substituído por Lark.js otimizado
 *     - Suporta campos com valores multilinha (indentados)
 *     - Retorna localização (linha) para navegação
 */

class SynesisParser {
    /**
     * Parseia blocos SOURCE de um arquivo .syn
     * @param {string} content - Conteúdo do arquivo
     * @param {string} filePath - Caminho do arquivo (para debug)
     * @returns {Array<SourceBlock>} Array de blocos SOURCE parseados
     *
     * SourceBlock: {
     *   bibref: string (ex: "@ashworth2019"),
     *   fields: Object (field_name -> value),
     *   line: number,
     *   file: string,
     *   blockContent: string,
     *   blockOffset: number,
     *   startOffset: number,
     *   endOffset: number
     * }
     */
    parseSourceBlocks(content, filePath) {
        const blocks = [];

        // Regex: SOURCE @bibref ... END SOURCE
        const sourcePattern = /SOURCE\s+(@[\p{L}\p{N}._-]+)(.*?)END\s+SOURCE/gsu;

        let match;
        while ((match = sourcePattern.exec(content)) !== null) {
            const bibref = match[1];
            const blockContent = match[2];
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const blockOffset = match.index + match[0].indexOf(blockContent);
            const line = this._getLineNumber(content, match.index);

            // Extrair campos do bloco
            const fields = this._parseFieldEntries(blockContent);

            blocks.push({
                bibref,
                fields,
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
     * Parseia blocos ITEM de um arquivo .syn
     * @param {string} content - Conteúdo do arquivo
     * @param {string} filePath - Caminho do arquivo
     * @returns {Array<ItemBlock>} Array de blocos ITEM parseados
     *
     * ItemBlock: {
     *   bibref: string (ex: "@ashworth2019"),
     *   fields: Object (field_name -> value),
     *   line: number,
     *   file: string,
     *   blockContent: string,
     *   blockOffset: number,
     *   startOffset: number,
     *   endOffset: number
     * }
     */
    parseItems(content, filePath) {
        const items = [];

        // Regex: ITEM @bibref ... END ITEM
        const itemPattern = /ITEM\s+(@[\p{L}\p{N}._-]+)(.*?)END\s+ITEM/gsu;

        let match;
        while ((match = itemPattern.exec(content)) !== null) {
            const bibref = match[1];
            const blockContent = match[2];
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const blockOffset = match.index + match[0].indexOf(blockContent);
            const line = this._getLineNumber(content, match.index);

            // Extrair campos do bloco
            const fields = this._parseFieldEntries(blockContent);

            items.push({
                bibref,
                fields,
                line,
                file: filePath,
                blockContent,
                blockOffset,
                startOffset,
                endOffset
            });
        }

        return items;
    }

    /**
     * Extrai campos de um bloco SOURCE ou ITEM
     * Suporta valores multilinha indentados
     * @private
     * @param {string} blockContent - Conteúdo interno do bloco
     * @returns {Object} field_name -> value
     */
    _parseFieldEntries(blockContent) {
        const fields = {};

        // Regex para capturar field_name: value (com suporte a multilinha)
        // Captura: field_name seguido de ":", depois o valor até próximo field ou fim
        const lines = blockContent.split('\n');
        let currentField = null;
        let currentValue = [];

        for (const line of lines) {
            const trimmed = line.trim();

            // Ignora linhas vazias ou comentários
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Detecta novo campo (field_name:)
            const fieldMatch = trimmed.match(/^([\p{L}\p{N}._-]+)\s*:\s*(.*)$/u);

            if (fieldMatch) {
                // Salva campo anterior se existir
                if (currentField) {
                    fields[currentField] = currentValue.join('\n').trim();
                }

                // Inicia novo campo
                currentField = fieldMatch[1];
                currentValue = [fieldMatch[2]];
            } else if (currentField) {
                // Continua valor multilinha
                currentValue.push(trimmed);
            }
        }

        // Salva último campo
        if (currentField) {
            fields[currentField] = currentValue.join('\n').trim();
        }

        return fields;
    }

    /**
     * Calcula número da linha a partir de um offset no conteúdo
     * @private
     */
    _getLineNumber(content, offset) {
        const beforeMatch = content.substring(0, offset);
        return beforeMatch.split('\n').length - 1;
    }

    /**
     * Conta ITEMs dentro de um bloco SOURCE
     * @param {string} content - Conteúdo do bloco SOURCE
     * @returns {number}
     */
    countItemsInSource(content, bibref) {
        const itemPattern = new RegExp(`ITEM\\s+${bibref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gu');
        const matches = content.match(itemPattern);
        return matches ? matches.length : 0;
    }
}

module.exports = SynesisParser;
