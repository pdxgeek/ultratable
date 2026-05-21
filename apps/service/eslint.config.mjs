import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'coverage'] },
    {
        files: ['**/*.ts'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': 'warn',
            'no-useless-assignment': 'warn',
            'prefer-const': 'warn',
            'preserve-caught-error': 'off',
            'no-empty': 'warn',
            'no-console': 'error',
        },
    },
    {
        // CLI entry points and one-off scripts may use console freely.
        files: ['src/scripts/**/*.ts', 'src/db/migrate.ts', 'run-migration.ts'],
        rules: {
            'no-console': 'off',
        },
    },
);
