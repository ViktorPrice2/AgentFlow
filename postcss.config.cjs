const path = require('node:path');

const SEARCH_PATHS = [
  __dirname,
  path.resolve(__dirname, 'app'),
  path.resolve(__dirname, 'app/renderer'),
  path.resolve(__dirname, 'app/ui')
];

const plugins = {};

function resolveTailwind() {
  try {
    require.resolve('tailwindcss', { paths: SEARCH_PATHS });
    return true;
  } catch (error) {
    if (process.env.AGENTFLOW_DEBUG_POSTCSS === '1') {
      console.warn('[agentflow] tailwindcss not found, skipping PostCSS plugin.');
      console.warn(error.message);
    }
    return false;
  }
}

if (resolveTailwind()) {
  plugins.tailwindcss = {};
}

plugins.autoprefixer = {};

module.exports = { plugins };
