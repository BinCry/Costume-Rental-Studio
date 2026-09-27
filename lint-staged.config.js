import { defineConfig } from 'lint-staged/config';

const lintAndFormat = ['eslint --fix', 'prettier --write'];

export default defineConfig({
  'apps/api/**/*.ts': lintAndFormat,
  'apps/web/**/*.{ts,tsx}': lintAndFormat,
  '*.{js,mjs,cjs}': lintAndFormat,
  '*.{json,jsonc,yaml,yml,css,html}': 'prettier --write',
});
