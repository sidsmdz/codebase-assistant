# Testing the Decision Engine Architecture

## What We Built

You now have a complete "Decision Engine" that enables `@workspace` and Copilot Agent to autonomously discover and use AutoForge tools for intelligent code analysis.

### Three Key Components

1. **System Instructions** (`.github/copilot-instructions.md`)
   - The "SOP" that tells AI agents when and how to use AutoForge tools
   - Read automatically by Copilot in any conversation
   - Defines mandatory usage rules and decision frameworks

2. **Enhanced Language Model Tools** (3 tools registered)
   - `#autoforge_analyzeImpact` - Impact analysis before refactoring
   - `#autoforge_findFeature` - Semantic feature discovery
   - `#autoforge_verifyBridge` - Validation loop for generated code

3. **Cross-Language Verification** (New!)
   - Parses Java and TypeScript structures
   - Detects missing fields and type mismatches
   - Enforces "Plan-Act-Verify" cycle

---

## How to Test

### Test 1: Basic Tool Discovery

**Goal:** Verify that `@workspace` reads the system instructions and knows about our tools.

**Steps:**
1. Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")
2. Open any Java or TypeScript file from `test-fixtures/multi-module-enterprise`
3. In Copilot Chat, type:
   ```
   @workspace What tools are available for analyzing this codebase?
   ```

**Expected Result:**
- `@workspace` should mention the AutoForge tools
- Should reference the `.github/copilot-instructions.md` rules
- Should explain when to use each tool

---

### Test 2: Automatic Impact Analysis

**Goal:** Verify automatic impact analysis when refactoring is requested.

**✅ WORKING APPROACH - Use @autoforge:**
```
@autoforge refactor PermissionService
```
or
```
@autoforge Can we refactor the PermissionService class?
```

**Expected Workflow:**
1. `@autoforge` detects refactor keyword automatically
2. Extracts symbol name: "PermissionService"
3. Runs `featureGraphProvider.analyzeImpact()` internally
4. Displays impact analysis inline with markdown formatting

**What to Watch For:**
- Progress message: "🔍 Analyzing Impact: PermissionService..."
- Risk Score: X/100
- Affected Files: Y files
- Cross-language dependencies (Java ↔ TypeScript)
- Recommendation: SAFE / RISKY / REQUIRES_COORDINATION

**❌ LIMITATION - @workspace Cannot Invoke Third-Party Tools:**

When you type:
```
@workspace Can we refactor the PermissionService class?
```

You'll see:
- `@workspace` **recognizes** it should call the tool
- Shows: `#autoforge_analyzeImpact symbolName="PermissionService"` as text
- But **does NOT execute** the tool (API limitation)

**Why:** The Language Model Tools API is designed for internal extension use. `@workspace` can only invoke built-in VS Code tools, not third-party extensions.

**Solution:** Use `@autoforge` which has built-in auto-detection

---

### Test 3: Feature Discovery

**Goal:** Test natural language feature mapping.

**Steps:**
1. In Copilot Chat, type:
   ```
   @workspace How do user permissions work in this codebase?
   ```

**Expected Workflow:**
1. System instruction says: "BEFORE explaining logic, MUST call #autoforge_findFeature"
2. `@workspace` calls `#autoforge_findFeature` with `query="user permissions authorization"`
3. AutoForge returns feature graph showing Java → TypeScript connections
4. `@workspace` explains based on actual codebase structure

**What to Watch For:**
- Progress message: "🎯 AutoForge is finding feature..."
- Feature graph with entry points (frontend + backend)
- Cross-language links (PermissionService.java → AuthGuard.ts)
- Confidence score

---

### Test 4: Verification Loop

**Goal:** Test that generated code is validated before presentation.

**Steps:**
1. In Copilot Chat, type:
   ```
   @workspace Add a 'role' field to the User entity (both Java and TypeScript)
   ```

**Expected Workflow:**
1. `@workspace` generates Java change: `User.java` adds `private String role;`
2. `@workspace` generates TypeScript change: `User.ts` adds `role: string;`
3. System instruction says: "AFTER generating code, MUST call #autoforge_verifyBridge"
4. `@workspace` calls `#autoforge_verifyBridge` with both changes
5. AutoForge validates structural synchronization
6. If PASS → present code to user
7. If FAIL → regenerate missing parts and re-verify

**What to Watch For:**
- Progress message: "🔍 AutoForge is verifying cross-language bridge..."
- Verification result: SUCCESS or STRUCTURE_MISMATCH
- If mismatch detected, `@workspace` should auto-fix and re-verify
- Final code should have matching fields in both languages

---

## Manual Tool Invocation (Fallback)

If `@workspace` doesn't auto-discover the tools (API limitation), you can manually invoke them:

### Impact Analysis
```
#autoforge_analyzeImpact
Symbol: PermissionService
```

### Feature Discovery
```
#autoforge_findFeature
Query: user permissions authorization
```

### Bridge Verification
```
#autoforge_verifyBridge
Proposed Changes: 
{
  "files": [
    {
      "path": "src/main/java/com/example/User.java",
      "language": "java",
      "content": "class User { private String role; }"
    },
    {
      "path": "src/webapp/User.ts",
      "language": "typescript",
      "content": "interface User { role: string; }"
    }
  ]
}
```

---

## Debugging

### Check Extension Activation
1. Open **Developer Console** (`Help` → `Toggle Developer Tools`)
2. Look for: `[AutoForge] Language Model Tools registered`
3. If missing, check activation events in `package.json`

### Check System Instructions
1. Verify `.github/copilot-instructions.md` exists
2. Copilot reads this automatically in any chat
3. Try asking: `@workspace What are the AutoForge project governance rules?`

### Check Tool Registration
```javascript
// In Developer Console
vscode.lm.tools
// Should show: autoforge_analyzeImpact, autoforge_findFeature, autoforge_verifyBridge
```

---

## Success Criteria

✅ **Tool Discovery:** `@workspace` knows about AutoForge tools and references system instructions

✅ **Auto-Impact Analysis:** Refactor requests trigger `#autoforge_analyzeImpact` automatically

✅ **Feature Mapping:** "How does X work?" triggers `#autoforge_findFeature` automatically

✅ **Verification Loop:** Multi-language changes trigger `#autoforge_verifyBridge` automatically

✅ **Ground Truth:** AI bases answers on actual AST/LSP data, not generic patterns

---

## What If It Doesn't Work?

### Discovery: Language Model Tools API Limitation

Through testing, we discovered that **`@workspace` cannot invoke third-party Language Model Tools**, even with system instructions in place. Here's what actually happens:

**What Works:**
- ✅ `@workspace` reads `.github/copilot-instructions.md`
- ✅ `@workspace` recognizes when to use AutoForge tools
- ✅ `@workspace` shows the tool syntax: `#autoforge_analyzeImpact symbolName="X"`

**What Doesn't Work:**
- ❌ `@workspace` cannot **execute** third-party tools
- ❌ Tool invocation shows as text, not actual execution
- ❌ No progress message, no results returned

**Why:** The Language Model Tools API is currently designed for **internal extension use only**. VS Code agents like `@workspace` can only invoke built-in VS Code tools, not third-party extensions.

### The Working Solution: @autoforge Participant

We built **auto-detection** directly into the `@autoforge` participant for this exact scenario:

```typescript
// Auto-detects refactor keywords
const refactorKeywords = /\b(refactor|rename|modify|change|delete|remove)\b/i;
if (refactorKeywords.test(request.prompt)) {
  const symbolName = extractPascalCase(request.prompt);
  const impact = await featureGraphProvider.analyzeImpact(symbolName);
  // Display results inline
}
```

**Usage:**
```
@autoforge refactor PermissionService
```

This works because it's **internal to the extension** - no external tool invocation needed.

### Hybrid Approach

1. **For Direct Refactoring:** Use `@autoforge` with auto-detection
   - Instant impact analysis
   - Built-in verification loop
   - No API limitations

2. **For General Questions:** Use `@workspace` 
   - Leverages Copilot's full reasoning
   - Can reference system instructions as guidance
   - Manual tool invocation with `#tool_name` syntax

3. **For Complex Workflows:** Chain them together
   ```
   @autoforge analyze PermissionService
   # Review the impact analysis
   @workspace implement the refactor based on AutoForge's analysis
   ```

---

## Next Steps

1. Test all 4 scenarios above
2. Report results (which approach works for you)
3. If system instructions work → amazing! This is the future.
4. If not → use `@autoforge` participant with built-in auto-detection
5. Either way, you have a working "Decision Engine" with governance

---

**The Vision:** Whether through system instructions or smart participant logic, AutoForge provides the "structural awareness layer" that elevates AI from generic advice to project-specific, validated solutions.
