import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

import { baseTypeScriptConfig, prettierCompatibilityConfig } from '../../eslint.config.js';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', 'src/generated/**', '.agents/**']),
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'prisma7.config.ts'],
    extends: [...baseTypeScriptConfig, prettierCompatibilityConfig],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
]);
