# Project Cleanup Plan - Keep Decision Engine Working

## ✅ KEEP - Core Decision Engine Functionality

### Essential Files
- src/tools/FeatureGraphProvider.ts - The decision engine (664 lines)
- src/extension.ts - Tool registration + forceExecute command
- package.json - Language Model Tools definitions
- .github/copilot-instructions.md - System instructions
- .vscode/settings.json - Recommended settings

### Documentation (Essential)
- docs/SUCCESS_STORY.md - Working pattern + proof
- docs/QUICK_ACTION_CHECKLIST.md - Usage guide
- docs/TOOL_EXECUTION_TROUBLESHOOTING.md - Diagnostic steps
- docs/TOOL_BASED_ARCHITECTURE.md - Architecture overview
- README.md - Update with Decision Engine focus

### Dependencies (Keep as-is)
- src/parsers/* - Tree-sitter parsing (needed by FeatureGraphProvider)
- src/indexing/LSPProvider.ts - LSP integration (needed)
- src/knowledgeBase/KnowledgeBaseManager.ts - Context storage (needed)
- src/chatParticipant/index.ts - @autoforge participant (has auto-detection)

---

## 🗑️ REMOVE - Obsolete/Redundant Files

### Old Documentation (Outdated)
- SESSIONMANAGER_V2_MIGRATION.md - Migration doc (done)
- SCAN_MIGRATION_PLAN.md - Migration doc (done)
- EXTENSION_ACTIVATION_FIX.md - Old fix doc
- CURRENT_STATE_ANALYSIS.md - Outdated analysis
- PRE_PUSH_ANALYSIS.md - Old analysis

### Redundant Documentation in docs/
- docs/HYBRID_CONTEXT_ARCHITECTURE.md - Obsolete (pre-Decision Engine)
- docs/HYBRID_KB_IMPLEMENTATION_COMPLETE.md - Obsolete
- docs/USING_HYBRID_CONTEXT.md - Obsolete
- docs/KNOWLEDGE_GRAPH_*.md (3 files) - Future plans, not current
- docs/SEMANTIC_SEARCH_PLAN.md - Future plan
- docs/JSON_METADATA_FORMAT.md - Not implemented

### Keep for Reference but Archive
- docs/TREE_SITTER_WASM_SETUP.md - Useful reference
- docs/TOKEN_MANAGEMENT.md - Useful reference

---

## 📝 UPDATE - Files Needing Refresh

### README.md
- Remove old features
- Focus on Decision Engine
- Add working examples from SUCCESS_STORY.md
- Hybrid invocation pattern
- Installation + quick start

### package.json
- Update description to "Decision Engine for AI-Assisted Development"
- Clean up unused commands if any

---

## Cleanup Commands
