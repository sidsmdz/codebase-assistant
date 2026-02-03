#!/bin/bash
# Build tree-sitter grammar WASM files compatible with web-tree-sitter 0.26.5

set -e

echo "🏗️  Building tree-sitter grammar WASM files..."

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

cd "$TMP_DIR"

# Build Java grammar
echo "📦 Building Java grammar..."
git clone --depth 1 --branch v0.21.0 https://github.com/tree-sitter/tree-sitter-java.git
cd tree-sitter-java
tree-sitter build --wasm
cp tree-sitter-java.wasm "$OLDPWD/../grammars/"
cd "$TMP_DIR"

# Build TypeScript grammar
echo "📦 Building TypeScript grammar..."
git clone --depth 1 --branch v0.21.2 https://github.com/tree-sitter/tree-sitter-typescript.git
cd tree-sitter-typescript/typescript
tree-sitter build --wasm
cp tree-sitter-typescript.wasm "$OLDPWD/../../grammars/"

echo "✅ Grammar WASM files built successfully!"
ls -lh "$OLDPWD/../../grammars/"
