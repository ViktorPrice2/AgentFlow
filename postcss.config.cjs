const path = require('node:path');

const SEARCH_PATHS = [
  __dirname,
  path.resolve(__dirname, 'app'),
  path.resolve(__dirname, 'app/renderer'),
  path.resolve(__dirname, 'app/ui')
];

const plugins = {};

function hasModule(name) {
  try {
    require.resolve(name, { paths: SEARCH_PATHS });
    return true;
  } catch (error) {
    if (process.env.AGENTFLOW_DEBUG_POSTCSS === '1') {
      console.warn(`[agentflow] ${name} not found, skipping PostCSS plugin.`);
      console.warn(error.message);
    }
    return false;
  }
}

['tailwindcss', 'autoprefixer'].forEach((pluginName) => {
  if (hasModule(pluginName)) {
    plugins[pluginName] = {};
  }
});

module.exports = { plugins };
