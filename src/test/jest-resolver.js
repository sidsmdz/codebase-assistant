/**
 * Custom Jest resolver to handle ESM-only packages that use `exports` maps
 * with only `import` conditions (no `require`/`default` fallback).
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// Explicit mappings for ESM-only packages with no `main` and no `require` export
const ESM_EXPLICIT = {
    'chevrotain': 'chevrotain/lib/src/api.js',
    'chevrotain-allstar': 'chevrotain-allstar/lib/index.js',
    '@chevrotain/gast': '@chevrotain/gast/lib/src/api.js',
    '@chevrotain/cst-dts-gen': '@chevrotain/cst-dts-gen/lib/src/api.js',
    '@chevrotain/utils': '@chevrotain/utils/lib/src/api.js',
    '@chevrotain/regexp-to-ast': '@chevrotain/regexp-to-ast/lib/src/api.js',
};

module.exports = (request, options) => {
    if (ESM_EXPLICIT[request]) {
        return path.join(NODE_MODULES, ESM_EXPLICIT[request]);
    }

    return options.defaultResolver(request, {
        ...options,
        packageFilter: (pkg) => {
            // For ESM packages with exports map but no main, extract from exports
            if (pkg.type === 'module' && !pkg.main && pkg.exports) {
                const entry = pkg.exports['.'];
                if (entry) {
                    const resolved = typeof entry === 'string'
                        ? entry
                        : entry.import || entry.default;
                    if (resolved) {
                        pkg.main = resolved;
                    }
                }
            }
            return pkg;
        }
    });
};
