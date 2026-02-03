# Using AutoForge Hybrid Context

## Quick Start

### 1. Open a file in VS Code
Navigate to any `.java`, `.ts`, `.tsx`, or `.js` file in your workspace.

### 2. Ask a question naturally
```
@autoforge explain this function
@autoforge how does this work?
@autoforge what does this class do?
```

### 3. See the context automatically added
AutoForge will show a collapsible **"🧠 Thinking..."** section with:
- What code is being analyzed (Focal Point)
- Related files (Skeleton Map)
- External dependencies
- Any warnings/diagnostics

### 4. Use the /context command explicitly
```
@autoforge /context
```
Shows full hybrid context with all details.

## How It Works

### Automatic Context Detection

When you ask questions using keywords like:
- `explain`, `analyze`, `understand`
- `refactor`, `improve`, `optimize`
- `fix`, `debug`, `add`, `implement`
- `what`, `why`, `where`, `how`

AutoForge automatically:
1. Detects you need context
2. Analyzes current code with Tree-sitter + LSP
3. Shows transparent "Thinking..." section
4. Adds structured context to your conversation

### The Thinking Section

```markdown
<details>
<summary>🧠 Thinking... (context analysis)</summary>

**Context Added:**
- 📍 Focal Point: getUserById
- 📄 File: src/services/UserService.ts
- 🗺️ Related Files: 3
- 🔗 External Dependencies: 2
- ⚠️ Diagnostics: 1

**Skeleton Map:**
- UserService.ts (8 symbols)
- User.ts (5 symbols)
- AuthService.ts (6 symbols)

**Dependencies Resolved:**
- User from models/User.java
- Config from config/AppConfig.ts

**Diagnostics:**
- ⚠️ Warning: Unused variable 'temp'

*Token efficiency: ~90% reduction vs traditional full-file context*
</details>
```

Click to expand and see what context was added!

## Examples

### Example 1: Understanding Code

**You type:**
```
@autoforge explain how this authentication works
```

**AutoForge does:**
1. Detects "explain" keyword → adds context
2. Analyzes current function with Tree-sitter
3. Finds related files (AuthService, User model, etc.)
4. Resolves external dependencies (JWT library, etc.)
5. Shows transparent "Thinking..." section
6. Provides context to help answer your question

### Example 2: Refactoring

**You type:**
```
@autoforge help me refactor this to be more efficient
```

**AutoForge does:**
1. Detects "refactor" keyword → adds context
2. Extracts current method signature
3. Shows related methods in same file (skeleton)
4. Identifies dependencies used
5. Notes any warnings/issues
6. Transparent context added for refactoring suggestions

### Example 3: Debugging

**You type:**
```
@autoforge why isn't this working?
```

**AutoForge does:**
1. Detects "why" keyword → adds context
2. Captures exact code block
3. Shows diagnostics (errors/warnings)
4. Identifies types from external files
5. Transparent debugging context

## Commands

### `/context` - Show Full Context
```
@autoforge /context
```
Explicitly shows the hybrid context with full details.

**Use when:**
- You want to see what context is available
- Debugging context issues
- Understanding the scope of analysis

### `/scan` - Index Codebase
```
@autoforge /scan
```
Indexes your workspace for features, components, and relationships.

**Use when:**
- First time using AutoForge
- Added new files/features
- Want fresh index

### `/find` - Search Knowledge Base
```
@autoforge /find authentication
```
Searches indexed features and components.

**Use when:**
- Looking for specific functionality
- Exploring unfamiliar codebase
- Finding related components

## Benefits

### 🎯 Token Efficient
- 90% reduction vs dumping full files
- More room for conversation history
- Faster responses

### 🔍 Accurate
- Tree-sitter provides exact structure
- LSP ensures type correctness
- Real-time, never stale

### 📊 Transparent
- See exactly what context is added
- Collapsible, non-intrusive
- Educational - learn what's relevant

### 🤖 Smart
- Only adds context when needed
- Detects intent from your question
- Focuses on what matters

## Tips

### 💡 Tip 1: Natural Questions
Just ask naturally! AutoForge detects when context is needed:
```
✅ @autoforge explain this function
✅ @autoforge how does authentication work here?
✅ @autoforge what's wrong with this code?
```

### 💡 Tip 2: Check the Thinking Section
Always expand the "🧠 Thinking..." section to verify:
- The right code is being analyzed
- Dependencies are resolved correctly
- No unexpected diagnostics

### 💡 Tip 3: Use with @workspace
After AutoForge adds context, use `@workspace` for code generation:
```
1. @autoforge explain this function
2. [Context added]
3. @workspace implement a similar function for updating users
```

### 💡 Tip 4: Explicit Context
Use `/context` when you need to see everything:
```
@autoforge /context
```
Shows full skeleton map, all dependencies, complete analysis.

### 💡 Tip 5: Combine with Sessions
Create sessions to save context:
```
1. @autoforge /session auth-refactor
2. @autoforge explain authentication flow
3. [Work on other things]
4. @autoforge /session auth-refactor  # Restore context
```

## Troubleshooting

### "No context added"
**Issue:** You asked a question but no context was added.

**Solutions:**
- Use `/context` explicitly
- Check if a file is open in the editor
- Use keywords: explain, analyze, etc.

### "Wrong context analyzed"
**Issue:** The thinking section shows wrong file/function.

**Solutions:**
- Move cursor to the right location
- Select the specific code block
- Use `/context` to verify

### "Too many dependencies"
**Issue:** Context includes too many files.

**Solutions:**
- This is intentional - shows all related code
- Focus on the "Focal Point" section
- Dependencies are just signatures, very small

## Advanced Usage

### Custom Context Scope

The context includes three layers:

1. **Focal Point** (Full code)
   - The function/class you're in
   - Complete implementation

2. **Skeleton Map** (Signatures only)
   - Current file structure
   - Related files (signatures only)
   - 80-90% token reduction

3. **Dependencies** (Interfaces only)
   - External types used
   - Imported classes/functions
   - Just the public interface

### Token Comparison

**Traditional approach:**
```
Full UserService.ts: 500 lines = ~2000 tokens
Full User.java: 300 lines = ~1200 tokens
Full Config.ts: 200 lines = ~800 tokens
Total: ~4000 tokens
```

**Hybrid approach:**
```
Focal Point (getUserById): 20 lines = ~80 tokens
Skeleton Map (3 files): 30 signatures = ~200 tokens
Dependencies (2 types): 5 interfaces = ~100 tokens
Total: ~380 tokens (90% reduction!)
```

## Feedback

The hybrid context feature is new! Please report issues or suggestions:
- What context was helpful?
- What was missing?
- Was the "Thinking..." section clear?
- Any false positives (context added when not needed)?

## Summary

AutoForge's Hybrid Context:
- ✅ Automatically detects when you need context
- ✅ Shows transparent "Thinking..." section
- ✅ 90% token reduction vs traditional methods
- ✅ Combines Tree-sitter (structure) + LSP (semantics)
- ✅ Works with natural questions
- ✅ Enhances Copilot without competing

Just ask questions naturally and let AutoForge handle the context! 🚀
