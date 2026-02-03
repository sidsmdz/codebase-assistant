# AutoForge Extension - Installation Guide

## No npm install Required! 🎉

The extension is now packaged as a standalone `.vsix` file with all dependencies bundled. You can install it on **any machine** without running `npm install`.

## Quick Install

### Option 1: VS Code UI (Easiest)

1. Open VS Code
2. Go to **Extensions** (Ctrl+Shift+X / Cmd+Shift+X)
3. Click the `...` menu (three dots) at the top
4. Select **"Install from VSIX..."**
5. Choose `autoforge-0.3.0.vsix`
6. Reload VS Code when prompted

### Option 2: Command Line

```bash
code --install-extension autoforge-0.3.0.vsix
```

### Option 3: Manual Install

1. Copy `autoforge-0.3.0.vsix` to the target machine
2. Run: `code --install-extension /path/to/autoforge-0.3.0.vsix`

## What's Included in the .vsix?

The packaged extension includes:
- ✅ Compiled JavaScript bundle (`dist/extension.js` - 828 KB)
- ✅ sql.js WASM runtime (`sql-wasm.wasm` - 644 KB)
- ✅ web-tree-sitter WASM (`web-tree-sitter.wasm` - 192 KB)
- ✅ All bundled npm dependencies
- ✅ Documentation and media assets

**Total size: 676 KB** - Tiny and self-contained!

## Verify Installation

After installing:

1. Reload VS Code (Ctrl+Shift+P → "Reload Window")
2. Open GitHub Copilot Chat
3. Type `@autoforge` - you should see AutoForge appear
4. Test with: `@autoforge /scan`

## For Developers: Rebuild Package

If you modify the source code:

```bash
# Install dependencies (one-time only)
npm install

# Build and package
npm run package:vsix

# This creates a new autoforge-x.x.x.vsix file
```

## Distribution

You can now **share the .vsix file** with others:
- Email attachment
- File share
- GitHub Releases
- Internal company server
- VS Code Marketplace (if published)

**No build environment needed on target machines!**

## Uninstall

```bash
code --uninstall-extension your-company.autoforge
```

Or use the Extensions UI in VS Code.

## Troubleshooting

### Extension doesn't activate

1. Check Output panel: View → Output → Select "AutoForge"
2. Check for errors in Developer Tools: Help → Toggle Developer Tools
3. Verify GitHub Copilot extension is installed and activated

### Commands not showing

1. Make sure you're in GitHub Copilot Chat (not regular chat)
2. Type `@autoforge` and press Space
3. Commands should appear in autocomplete

### WASM files not loading

The .vsix package includes all WASM files in `dist/`. If you see errors:
- Check that `dist/sql-wasm.wasm` exists (644 KB)
- Check that `dist/web-tree-sitter.wasm` exists (192 KB)
- Rebuild: `npm run package:vsix`

## Version Management

Current version: **0.3.0**

To update the version:
1. Edit `package.json` → change `"version": "0.3.0"` to new version
2. Rebuild: `npm run package:vsix`
3. New file: `autoforge-0.4.0.vsix`

## Benefits of .vsix Packaging

✅ **Zero configuration** - No npm, Node.js, or build tools required
✅ **Cross-platform** - Same file works on Windows/macOS/Linux
✅ **Offline install** - No internet connection needed on target machine
✅ **Version control** - Easy to maintain multiple versions
✅ **Fast deployment** - Just copy one file
✅ **Secure** - No post-install scripts, no npm registry dependencies
