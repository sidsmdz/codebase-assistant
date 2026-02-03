# Tool-Based Architecture Implementation

## Overview

**Major Pivot:** From passive "context provider" to active "decision oracle" that @workspace can query autonomously.

## The Problem We Solved

Previously, AutoForge **injected context** into chat conversations. The LLM would see code snippets but still ask clarifying questions because:
1. Context treated as "suggestion" not "ground truth"
2. No structured decision-making logic
3. No way for @workspace to autonomously query our analysis

## The Solution: Language Model Tools

We now expose **3 queryable tools** that any agent (@workspace, Copilot Agent Mode, Edit Mode) can invoke:

### Tool 1: `autoforge_analyzeImpact`

**When to use:** Before modifying/refactoring/deleting ANY symbol

**What it does:**
- Finds symbol location using LSP workspace search
- Extracts AST structure (visibility, abstract, extends, implements, methods, fields)
- Finds ALL references across workspace using LSP
- Discovers cross-language dependencies (Java ↔ TypeScript)
- Calculates risk score (0-100)
- Generates governance recommendation

**Returns:**
```json
{
  "summary": "PermissionService (class) has 12 references across java, typescript",
  "riskScore": 65,
  "recommendation": "⚠️ MEDIUM RISK: 12 files affected. Includes 3 cross-language links. Test thoroughly and consider phased rollout.",
  "details": {
    "location": { "file": "...", "line": 15, "language": "java" },
    "structure": {
      "visibility": "public",
      "isAbstract": false,
      "methods": ["validatePermission", "checkAccess"],
      "fields": ["permissionRepository"]
    },
    "references": 12,
    "crossLanguageLinks": 3
  }
}
```

**Example flow:**
```
User: "@workspace refactor Permission class"
Workspace: (Sees tool) "I should check impact first"
Workspace: Calls autoforge_analyzeImpact("Permission")
AutoForge: Returns { riskScore: 85, references: 23, crossLanguageLinks: 5 }
Workspace: "⚠️ This is high-risk. I'll refactor the Java class AND update all TypeScript interfaces to prevent breakage."
```

### Tool 2: `autoforge_findFeature`

**When to use:** User asks about features in natural language

**What it does:**
- Extracts keywords from query ("permissions", "authentication")
- Searches knowledge base for matching features
- Finds entry points (Controllers, Hooks, Services)
- Builds call flow graph (frontend → backend)
- Maps API endpoints across languages
- Calculates confidence score

**Returns:**
```json
{
  "summary": "Found feature: permissions (confidence: 85%)",
  "entryPoints": {
    "frontend": { "file": "hooks/usePermission.ts", "type": "hook" },
    "backend": { "file": "PermissionController.java", "type": "controller" }
  },
  "keywords": ["permission", "auth", "access"],
  "relatedSymbols": ["Permission", "PermissionService", "usePermission"],
  "confidence": 0.85
}
```

**Example flow:**
```
User: "@workspace explain how permissions work"
Workspace: Calls autoforge_findFeature("permissions")
AutoForge: Returns { entryPoints: { frontend: "usePermission.ts", backend: "PermissionController.java" } }
Workspace: "Permissions are implemented via usePermission hook (frontend) which calls PermissionController (backend)..."
```

### Tool 3: `autoforge_validateRefactor`

**When to use:** BEFORE any refactoring (Check-Before-Act pattern)

**What it does:**
- Runs analyzeImpact internally
- Identifies **blockers** (high-risk changes that should stop)
- Lists **warnings** (concerns but non-blocking)
- Plans changes for each affected file
- Generates safe refactor strategy with rollback plan
- Returns canProceed boolean

**Returns:**
```json
{
  "canProceed": true,
  "summary": "✅ Safe to proceed (risky)",
  "blockers": [],
  "warnings": [
    "12 files will be affected - consider phased rollout",
    "3 cross-language dependencies found - verify all language changes"
  ],
  "affectedFiles": 12,
  "strategy": {
    "approach": "risky",
    "steps": [
      "1. Create feature flag",
      "2. Update main symbol",
      "3. Update each dependent file",
      "4. Test with flag enabled",
      "5. Gradual rollout"
    ],
    "rollbackPlan": "Disable feature flag and revert main symbol"
  }
}
```

**Example flow:**
```
User: "@workspace rename Permission to PermissionEntity"
Workspace: Calls autoforge_validateRefactor("Permission", "rename to PermissionEntity")
AutoForge: Returns { canProceed: false, blockers: ["High risk score (85/100): This symbol is critical"] }
Workspace: "⛔ I cannot proceed: This class is critical to system stability. Consider creating a new interface instead."
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         @workspace Agent                         │
│                   (GitHub Copilot Agent Mode)                    │
└────────────┬────────────────────────────────────────────────────┘
             │ Autonomous Tool Invocation
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Language Model Tools API                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ analyzeImpact    │  │ findFeature      │  │validateRefactor│ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FeatureGraphProvider                          │
│                     (Decision Engine)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Combines:                                               │   │
│  │  • Tree-sitter AST (structural understanding)            │   │
│  │  • LSP (semantic understanding, cross-file references)   │   │
│  │  • Knowledge Base (historical patterns)                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Tool Registration (package.json)

```json
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "autoforge_analyzeImpact",
        "displayName": "Analyze Code Impact",
        "modelDescription": "Use this tool WHENEVER the user wants to modify...",
        "inputSchema": {
          "type": "object",
          "properties": {
            "symbolName": { "type": "string", "description": "..." }
          }
        },
        "canBeReferencedInPrompt": true
      }
    ]
  }
}
```

**Key properties:**
- `modelDescription`: Instructions for when LLM should use tool (critical!)
- `inputSchema`: JSON Schema for input validation
- `canBeReferencedInPrompt: true`: Allows users to type `#autoforge_analyzeImpact` manually

### 2. Tool Implementation (extension.ts)

```typescript
vscode.lm.registerTool('autoforge_analyzeImpact', {
    async invoke(options, token) {
        const { symbolName } = options.input;
        const impact = await featureGraphProvider.analyzeImpact(symbolName);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(impact))
        ]);
    },
    
    async prepareInvocation(options, token) {
        return {
            invocationMessage: `🔍 AutoForge is analyzing impact of: ${symbolName}...`
        };
    }
})
```

**Key methods:**
- `invoke()`: Main tool logic, returns structured JSON
- `prepareInvocation()`: Shows progress message while tool runs

### 3. Decision Engine (FeatureGraphProvider.ts)

**Core algorithm:**
1. Find symbol location (LSP workspace search)
2. Extract structure (Tree-sitter AST parsing)
3. Find references (LSP reference provider)
4. Find cross-language links (file name matching, API endpoint matching)
5. Calculate risk score (weighted algorithm)
6. Generate recommendation (governance rules)

**Risk Score Algorithm:**
```typescript
riskScore = 
    min(references * 2, 40) +        // More refs = higher risk
    crossLanguageLinks * 10 +         // Cross-language = risky
    (public ? 20 : 0) +               // Public = more impact
    (abstract ? 15 : 0)               // Abstract = many impls
```

## Usage Examples

### Example 1: Safe Refactor

```
User: "@workspace rename getUserById to findUserById"

Workspace → autoforge_validateRefactor("getUserById", "rename to findUserById")
AutoForge ← { canProceed: true, warnings: ["3 files affected"], strategy: "safe" }
Workspace → "I'll rename the method in 3 places: UserService.java, UserController.java, UserRepository.java"
[Performs refactor automatically]
```

### Example 2: Blocked Refactor

```
User: "@workspace change Permission from class to interface"

Workspace → autoforge_validateRefactor("Permission", "change to interface")
AutoForge ← { 
  canProceed: false, 
  blockers: ["High risk (85/100): 23 files depend on this"],
  riskScore: 85
}
Workspace → "⛔ I cannot proceed. This class is used by 23 files. Consider:
1. Create a new IPermission interface
2. Make Permission implement IPermission
3. Gradually migrate consumers
4. Deprecate Permission class later"
```

### Example 3: Feature Discovery

```
User: "@workspace how does authentication work?"

Workspace → autoforge_findFeature("authentication")
AutoForge ← { 
  entryPoints: { 
    backend: "AuthController.java",
    frontend: "useAuth.ts"
  },
  confidence: 0.92
}
Workspace → "Authentication is handled via:
Backend: AuthController.java validates JWT tokens using AuthService
Frontend: useAuth hook provides login/logout functions via /api/auth endpoint
[Shows code from both files]"
```

## Benefits

### 1. Autonomous Decision-Making

- @workspace **proactively** checks impact before acting
- No need for user to manually run commands
- "Check-Before-Act" pattern built-in

### 2. Cross-Language Governance

- Understands Java ↔ TypeScript dependencies
- Prevents breaking changes across language boundaries
- Maps API endpoints automatically

### 3. Risk-Aware Refactoring

- Calculates risk scores based on multiple factors
- Provides actionable recommendations
- Suggests safe strategies with rollback plans

### 4. Transparent Decision Process

- Progress messages show what AutoForge is doing
- Structured JSON output explains reasoning
- Users can manually invoke tools with `#autoforge_*`

## Testing

### Manual Test

1. Reload VS Code extension (F5)
2. Open a Java or TypeScript file
3. Ask: "@workspace refactor the [ClassName]"
4. Watch for: "🔍 AutoForge is analyzing impact..."
5. Verify @workspace mentions risk score and affected files

### Verify Tool Registration

```typescript
// In VS Code extension host
const tools = await vscode.lm.tools();
console.log(tools.filter(t => t.name.startsWith('autoforge_')));
// Should show: analyzeImpact, findFeature, validateRefactor
```

### Test Individual Tools

```
User: "#autoforge_analyzeImpact PermissionService"
```
Should show impact analysis directly in chat.

## Future Enhancements

### Phase 2: Semantic Search
- Add vector embeddings for concept matching
- Find "authentication" even if code uses "authScopes"

### Phase 3: JSON Metadata
- Structured call flow graphs
- Hierarchical feature maps
- API endpoint correlation

### Phase 4: Live Refactoring
- Tools can return edits, not just analysis
- @workspace applies edits automatically
- Preview changes before applying

## Migration from Context Provider

**Old approach:**
```typescript
// Passive: Inject context into stream
stream.markdown(contextData);
```

**New approach:**
```typescript
// Active: Register queryable tools
vscode.lm.registerTool('autoforge_analyzeImpact', { invoke, prepareInvocation });
```

**Compatibility:**
- Chat participant still works (@autoforge commands)
- Context Provider still available for direct queries
- Tools are **additive** - both systems coexist

## Summary

**Before:** AutoForge was a "context suggester"
- Injected code snippets into chat
- LLM still asked clarifying questions
- No decision-making logic

**After:** AutoForge is a "decision oracle"
- @workspace calls tools autonomously
- Structured risk analysis and recommendations
- Check-Before-Act governance built-in
- Cross-language dependency awareness

**Result:** Seamless integration where @workspace feels like it "knows" your codebase.
