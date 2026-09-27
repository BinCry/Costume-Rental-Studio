/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
export default {
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './apps/web/src/index.css',
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  endOfLine: 'lf',
};
