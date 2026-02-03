# Tree-sitter WASM Setup Guide

## Why WASM Instead of Native?

✅ **No native compilation** - Works immediately in VS Code (Electron)
✅ **Cross-platform** - Same binary for Linux/Windows/macOS
✅ **No ABI issues** - No Electron version compatibility problems
⚠️ **Slightly slower** - ~10-20% slower than native (still very fast)

## Current Status

The extension now uses `web-tree-sitter` (WebAssembly version) which:
- ✅ Installs without compilation
- ✅ Works in Electron/Node.js/Browser
- ⚠️ Requires WASM grammar files for each language

## Quick Start (No Grammars)

The extension **works immediately** without grammar files. Tree-sitter WASM will initialize but language parsing is optional.

## Optional: Add Language Grammars

To enable full tree-sitter parsing, download WASM grammar files:

### 1. Create grammars directory
```bash
mkdir -p grammars
```

### 2. Download Java Grammar
```bash
cd grammars
curl -L -O https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.21.0/tree-sitter-java.wasm
```

### 3. Download TypeScript Grammar
```bash
curl -L -O https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.21.0/tree-sitter-typescript.wasm
```

### 4. Verify files exist
```bash
ls -lh grammars/
# Should show:
# tree-sitter-java.wasm
# tree-sitter-typescript.wasm
```

## Alternative: Download from npm

Some grammars are available as npm packages:

```bash
npm install --save-dev tree-sitter-wasms
```

Then copy WASM files from `node_modules/tree-sitter-wasms/out/`

## What Works Without Grammars?

Even without WASM grammars, the extension fully functions:

- ✅ Feature detection (uses existing Java/TypeScript parsers)
- ✅ Knowledge base management
- ✅ Chat commands (/analyze, /scan, /features)
- ✅ BM25 search
- ✅ Basic AST parsing

## What's Enhanced With Grammars?

When grammars are available:

- 🚀 Real-time incremental parsing
- 🚀 More accurate relationship extraction
- 🚀 Better call graph analysis
- 🚀 Faster large file parsing

## Troubleshooting

### "Language grammar not available" warning

This is **normal** if you haven't downloaded WASM files. The extension will work without them.

### WASM initialization fails

Check that `web-tree-sitter` is installed:
```bash
npm list web-tree-sitter
```

If not installed:
```bash
npm install --save web-tree-sitter
```

### Grammar files not found

Verify paths in `TreeSitterWasmManager.ts`:
```typescript
const javaWasmPath = path.join(__dirname, '../../grammars/tree-sitter-java.wasm');
```

Adjust path based on your build output structure.

## Performance Comparison

| Feature | Native tree-sitter | WASM tree-sitter | Basic Parser |
|---------|-------------------|------------------|--------------|
| Compatibility | ❌ Requires compilation | ✅ Works everywhere | ✅ Works everywhere |
| Speed | 🚀 100% | 🚀 80-90% | ⚡ 60-70% |
| Memory | 🎯 Lowest | 🎯 Low | 📊 Higher |
| Incremental | ✅ Yes | ✅ Yes | ❌ No |

## Summary

1. **Default behavior**: Extension works without any setup (uses basic parsing)
2. **With WASM only**: Tree-sitter initializes but no language-specific parsing
3. **With WASM + grammars**: Full tree-sitter features enabled

**Recommendation**: Start without grammars, add them later if you need advanced features.
