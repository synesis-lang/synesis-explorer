'use strict';

/**
 * eslint.config.js — flat config (ESLint 9+)
 *
 * Substitui `.eslintrc.json` + `.eslintignore`, ambos descontinuados: o ESLint 9
 * deixou de lê-los, e o CI falhava ao rodar a versão nova.
 *
 * Reproduz o comportamento anterior sem afrouxar nada — mesmos 51 arquivos
 * analisados, mesmos 3 warnings de `no-unused-vars`. As mudanças abaixo são de
 * FORMA, não de política:
 *   - `env` virou `languageOptions.globals` (pacote `globals`);
 *   - `extends: "eslint:recommended"` virou `js.configs.recommended`;
 *   - `.eslintignore` virou o bloco `ignores` desta lista.
 *
 * O código é CommonJS (`require`/`module.exports`), então `sourceType` é
 * `commonjs` — o `.eslintrc.json` dizia `module`, o que só não causava erro
 * porque nada dependia disso.
 */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        // Equivalente ao antigo .eslintignore.
        ignores: [
            'node_modules/**',
            'dist/**',
            '.vscode-test/**',
            'media/mermaid.min.js',
            '**/*.min.js',
        ],
    },

    js.configs.recommended,

    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
        rules: {
            // `caughtErrors` passou a valer "all" por padrão no ESLint 9; no 8
            // era "none". Sem fixar aqui, todo `catch (error)` que não usa a
            // variável vira warning — 4 casos legítimos neste repo, onde o
            // bloco existe para engolir a falha de propósito. Mantido "none"
            // para que a migração não altere a política de lint.
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', caughtErrors: 'none' },
            ],
            'no-console': 'off',
        },
    },
];
