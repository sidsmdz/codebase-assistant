const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Copy WASM files to dist (sql.js, web-tree-sitter, and tree-sitter grammars)
 * @type {import('esbuild').Plugin}
 */
const copyWasmPlugin = {
	name: 'copy-wasm',
	setup(build) {
		build.onEnd(() => {
			const distDir = path.join(__dirname, 'dist');
			const distGrammarsDir = path.join(distDir, 'grammars');
			
			try {
				if (!fs.existsSync(distDir)) {
					fs.mkdirSync(distDir, { recursive: true });
				}
				
				if (!fs.existsSync(distGrammarsDir)) {
					fs.mkdirSync(distGrammarsDir, { recursive: true });
				}
				
				// Copy sql.js WASM
				const sqlWasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
				const sqlWasmDest = path.join(distDir, 'sql-wasm.wasm');
				fs.copyFileSync(sqlWasmSource, sqlWasmDest);
				console.log('[copy-wasm] sql-wasm.wasm copied to dist/');
				
				// Copy web-tree-sitter WASM
				const treeSitterWasmSource = path.join(__dirname, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
				const treeSitterWasmDest = path.join(distDir, 'web-tree-sitter.wasm');
				if (fs.existsSync(treeSitterWasmSource)) {
					fs.copyFileSync(treeSitterWasmSource, treeSitterWasmDest);
					console.log('[copy-wasm] web-tree-sitter.wasm copied to dist/');
				}
				
				// Copy tree-sitter grammar WASM files
				const grammarsSource = path.join(__dirname, 'grammars');
				if (fs.existsSync(grammarsSource)) {
					const grammarFiles = fs.readdirSync(grammarsSource).filter(f => f.endsWith('.wasm'));
					grammarFiles.forEach(file => {
						const source = path.join(grammarsSource, file);
						const dest = path.join(distGrammarsDir, file);
						fs.copyFileSync(source, dest);
						console.log(`[copy-wasm] ${file} copied to dist/grammars/`);
					});
				}
			} catch (error) {
				console.error('[copy-wasm] Failed to copy WASM files:', error);
			}
		});
	}
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode', 'web-tree-sitter'],
		logLevel: 'silent',
		plugins: [
			copyWasmPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
