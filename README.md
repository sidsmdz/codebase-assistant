# AutoForge - Decision Engine for AI-Assisted Development

**Transform AI coding assistants from "helpful autocomplete" to "trusted engineering partner" by grounding every decision in structural facts.**

AutoForge provides Language Model Tools that enable `@workspace` and other AI agents to analyze code structure, calculate refactoring risk, and verify cross-language synchronization using Tree-sitter AST and LSP semantic data.

---

## 🎯 What is the Decision Engine?

The Decision Engine combines three sources of ground-truth:

1. **Tree-sitter AST** - Structural parsing (classes, methods, fields, visibility)
2. **LSP (Language Server Protocol)** - Semantic analysis (references, definitions, types)
3. **Knowledge Base** - Historical context and patterns

This enables AI agents to make **informed decisions** instead of **educated guesses**.

---

## ✨ Core Capabilities

### 1. Impact Analysis (`#autoforge_analyzeImpact`)
**Before refactoring**, know the blast radius:
- Risk score (0-100) based on actual usage patterns
- All files that reference the symbol
- Cross-language dependencies (Java ↔ TypeScript ↔ Proto)
- Visibility analysis (public/private/protected)
- Concrete recommendation (SAFE/RISKY/REQUIRES_COORDINATION)

### 2. Feature Discovery (`#autoforge_findFeature`)
**Map natural language to code**:
- "How do permissions work?" → PermissionService.java + AuthGuard.ts + permissions.proto
- Confidence scores for each match
- Complete call flow graphs (frontend → backend)
- Cross-language connection types (REST API, gRPC, shared interfaces)

### 3. Bridge Verification (`#autoforge_verifyBridge`)
**Validate generated code** before presenting:
- Detects missing fields (Java added `role`, TypeScript missing it)
- Type mismatch warnings (Java uses `String`, TS uses `number`)
- Breaking change analysis for shared interfaces
- Pass/Fail with specific errors and suggested fixes

---

## 🚀 Quick Start

### Installation

1. **Install the extension** (from `.vsix` or Extension Marketplace)
2. **Reload VS Code window**
3. **Open a workspace** with Java/TypeScript code
4. **Start using the tools!**

### Basic Usage - The Hybrid Invocation Pattern

**Step 1: Analyze Impact**
```
@workspace #autoforge_analyzeImpact refactor PermissionService
```

**Step 2: Generate Changes**
```
@workspace refactor PermissionService to use AuthorizationProvider pattern
```

**Step 3: Verify Cross-Language Sync**
```
@workspace #autoforge_verifyBridge verify the changes
```

**Step 4: Fix Issues and Re-verify**
```
@workspace create missing TypeScript interfaces
@workspace #autoforge_verifyBridge verify again
```

---

## 📖 Working Example

### Real Session Output

```bash
User: @workspace #autoforge_analyzeImpact refactor PermissionService

GitHub Copilot: 🔍 AutoForge is analyzing impact of: PermissionService...

Results:
- Risk Score: 20 (LOW RISK)
- References: 0 across the codebase
- Methods: 8 (createPermission, createRole, assignRoleToUser, ...)
- Fields: 3 (permissionRepository, roleRepository, userRoleRepository)
- Recommendation: ✅ Safe to proceed with normal testing

---

User: @workspace refactor PermissionService to use AuthorizationProvider pattern

GitHub Copilot: [Generates modular refactored code with dependency injection]

---

User: @workspace #autoforge_verifyBridge verify the changes

GitHub Copilot: 🔍 Verifying cross-language bridge...

Results:
- Status: SUCCESS ✅
- Java Changes Parsed: 3 classes
- Warnings: Missing TypeScript interface for PermissionService
- Recommendation: Create PermissionService.ts to match Java class

---

User: @workspace create missing TypeScript interfaces

GitHub Copilot: [Creates PermissionService.ts with matching interface]

---

User: @workspace #autoforge_verifyBridge verify again

GitHub Copilot: ✅ Verification PASSED - All structures synchronized!
```

---

## 🎓 How It Works

### The Hybrid Invocation Model

AutoForge tools use a **hybrid invocation pattern** that provides the best of both worlds:

**Pattern:**
```
@workspace #tool_name [task description]
```

**Benefits:**
- ✅ **User Control** - You decide when tools are invoked
- ✅ **No Prompts** - Tools execute immediately when referenced
- ✅ **AI Reasoning** - @workspace still does intelligent code generation
- ✅ **Ground Truth** - Tools provide structural facts from AST/LSP
- ✅ **Clear Intent** - Explicit in every prompt

### The Architecture

```
User Request
    ↓
@workspace (AI Agent)
    ↓
#autoforge_tool (Explicit invocation)
    ↓
FeatureGraphProvider (Decision Engine)
    ↓
├─ Tree-sitter AST Parser → Structure
├─ LSP Provider → Semantics
└─ Knowledge Base → History
    ↓
Ground-Truth Results
    ↓
@workspace uses data for informed decisions
    ↓
Generated Code + Verification
```

---

## 🔧 Configuration

### Recommended Settings

Add to your **User Settings** (`Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "github.copilot.chat.tools.autoApprove": [
    "autoforge_analyzeImpact",
    "autoforge_findFeature",
    "autoforge_verifyBridge"
  ],
  "github.copilot.chat.agent.proxyExtensionTools": true
}
```

These settings enable:
- Automatic execution when tools are referenced
- No "Confirm every time" prompts
- Seamless @workspace integration

---

## 📚 Documentation

- **[SUCCESS_STORY.md](docs/SUCCESS_STORY.md)** - Complete success narrative with metrics
- **[QUICK_ACTION_CHECKLIST.md](docs/QUICK_ACTION_CHECKLIST.md)** - Immediate action steps
- **[TOOL_EXECUTION_TROUBLESHOOTING.md](docs/TOOL_EXECUTION_TROUBLESHOOTING.md)** - Diagnostic guide
- **[TOOL_BASED_ARCHITECTURE.md](docs/TOOL_BASED_ARCHITECTURE.md)** - Architecture deep-dive
- **[System Instructions](.github/copilot-instructions.md)** - Governance rules

---

## 🎯 Use Cases

### Before Refactoring
```
@workspace #autoforge_analyzeImpact refactor UserService
```
Know the risk score, affected files, and cross-language dependencies **before** changing code.

### Understanding Features
```
@workspace #autoforge_findFeature how do user permissions work
```
Get a feature graph showing how frontend connects to backend with actual file locations.

### After Code Generation
```
@workspace #autoforge_verifyBridge verify my changes
```
Ensure Java DTOs and TypeScript interfaces are synchronized before committing.

### Complete Workflow
Chain them together for autonomous, validated refactoring:
1. Analyze impact → 2. Generate code → 3. Verify sync → 4. Fix issues → 5. Re-verify

---

## 🏗️ Technical Details

### Supported Languages
- ✅ **Java** - Full AST parsing with Tree-sitter
- ✅ **TypeScript** - Full AST parsing with Tree-sitter
- ✅ **Protocol Buffers** - Structure parsing
- 🔄 **More coming** - Architecture supports any language with Tree-sitter grammar

### Requirements
- **VS Code** 1.93.0 or higher
- **GitHub Copilot Chat** extension
- **Node.js** (for development)

### Key Technologies
- **Tree-sitter WASM** - Syntax-aware parsing in the browser
- **VS Code LSP** - Language Server Protocol integration
- **Language Model Tools API** - Tool registration and invocation
- **SQLite** - Knowledge base storage

---

## 🤝 Contributing

This is the future of AI-assisted development. Contributions welcome!

### Development Setup
```bash
git clone https://github.com/sidsmdz/codebase-assistant.git
cd codebase-assistant
npm install
npm run compile
```

### Testing
```bash
# Press F5 in VS Code to launch Extension Development Host
# Open test-fixtures/multi-module-enterprise
# Try the examples from Quick Start
```

---

## 📊 Success Metrics

From real testing:

| Test | Status | Details |
|------|--------|---------|
| Manual Tool Invocation | ✅ PASS | `#autoforge_analyzeImpact symbolName="X"` works |
| Hybrid @workspace Invocation | ✅ PASS | `@workspace #tool_name task` works |
| Impact Analysis Accuracy | ✅ PASS | Correctly identified 8 methods, 3 fields, 0 references |
| Risk Score Calculation | ✅ PASS | Returned 20 (LOW RISK) based on 0 references |
| Bridge Verification Parsing | ✅ PASS | Parsed 3 Java classes from proposed changes |
| Missing Interface Detection | ✅ PASS | Warned about missing TypeScript counterparts |
| Tool Result Integration | ✅ PASS | @workspace used tool data for recommendations |

---

## 🎉 What This Enables

**Before AutoForge:**
- AI guesses about code structure
- Refactors break cross-language sync
- No risk assessment before changes
- Manual verification required

**With AutoForge:**
- ✅ **Ground-truth structural data**
- ✅ **Cross-language synchronization verified**
- ✅ **Risk scores before every change**
- ✅ **Autonomous verification loop**

**Result:** Human Intent + AI Reasoning + Ground-Truth Data = Perfect Code Changes 🚀

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

Built with:
- [Tree-sitter](https://tree-sitter.github.io/) - Incremental parsing system
- [VS Code Extension API](https://code.visualstudio.com/api) - Language Model Tools
- [GitHub Copilot](https://github.com/features/copilot) - AI pair programmer

---

**Ready to transform your AI coding assistant into a trusted engineering partner?**

[Install AutoForge](https://github.com/sidsmdz/codebase-assistant/releases) | [Read the Docs](docs/) | [Report Issues](https://github.com/sidsmdz/codebase-assistant/issues)
