# AutoForge Chat Participant - Improvement Roadmap

> **Note:** Test fixtures prioritization is expected behavior (user was working in test-fixtures workspace)

---

## 🔴 High Priority (Critical UX Improvements)

### 1. Auto-capture @workspace Output for Analysis
**Problem:** After @workspace generates code, `/analyze` command can't find it without explicit selection.

**Current Behavior:**
```
User: @autoforge /generate unit tests
→ @workspace generates code
User: @autoforge /analyze
→ ❌ "No code found to analyze"
```

**Solution:**
- Monitor chat history for @workspace responses
- Extract code blocks from @workspace output
- Store in session metadata for later commands
- Auto-suggest analysis when code is detected

**Implementation:**
```typescript
// In handleQuestion after @workspace response
if (chatContext.history.last.participant === 'workspace') {
    const codeBlocks = extractCodeBlocks(lastResponse);
    await sessionManager.storeGeneratedCode(codeBlocks);
    
    // Auto-suggest next steps
    stream.markdown('💡 I noticed @workspace generated code. Type `/analyze` to review it.');
}
```

**Files to modify:**
- `src/chatParticipant.ts` - handleQuestion(), handleAnalyze()
- `src/SessionManager.ts` - Add storeGeneratedCode()

**Estimated effort:** 4 hours

---

### 2. Smart Fallbacks for /analyze Command
**Problem:** `/analyze` fails silently when no code is selected, even when context is available.

**Current Behavior:**
```
User: @autoforge /analyze
→ ❌ "No code found to analyze"
(Active editor has code open)
```

**Solution - Fallback Chain:**
```typescript
async function handleAnalyze(request, stream, ...) {
    // Priority 1: Explicit selection via #selection or #file
    let selection = await getCodeSelection(request.references);
    
    // Priority 2: Recent @workspace generated code
    if (!selection) {
        const recentCode = await sessionManager.getLastGeneratedCode();
        if (recentCode) {
            selection = createVirtualSelection(recentCode);
            stream.progress('Analyzing code from last @workspace response...');
        }
    }
    
    // Priority 3: Active editor selection or full file
    if (!selection) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const range = editor.selection.isEmpty 
                ? new vscode.Range(0, 0, editor.document.lineCount, 0)
                : editor.selection;
            selection = { document: editor.document, range };
            stream.progress('Analyzing active editor...');
        }
    }
    
    // Priority 4: Last mentioned file in chat
    if (!selection) {
        const lastFile = await sessionManager.getLastMentionedFile();
        if (lastFile) {
            selection = await openAndSelectFile(lastFile);
            stream.progress(`Analyzing ${lastFile}...`);
        }
    }
    
    if (!selection) {
        stream.markdown('⚠️ No code found. Try:\n');
        stream.markdown('- Select code in editor\n');
        stream.markdown('- Use `#file:path/to/file.ts`\n');
        stream.markdown('- Generate code first with `/generate`\n');
        return { hasCode: false };
    }
    
    // Proceed with analysis...
}
```

**Files to modify:**
- `src/chatParticipant.ts` - handleAnalyze(), getCodeSelection()
- `src/SessionManager.ts` - Add getLastGeneratedCode(), getLastMentionedFile()

**Estimated effort:** 3 hours

---

### 3. Condense Verbose Handoff Messages
**Problem:** Handoff to @workspace takes too much screen space with repetitive information.

**Current (10 lines):**
```markdown
## 🚀 Handing off to GitHub Copilot

**Your request:** Generate code based on our conversation context

✅ Added context from AutoForge knowledge base

Opening @workspace with enriched context...

*The same chat window will be used - no new windows!*

💡 Use the follow-up buttons below to return to AutoForge after @workspace responds.
```

**Proposed (2-3 lines):**
```markdown
🚀 **Forwarding to @workspace** with enriched KB context (3 features · 27 components · 0.8 KB)

_Use follow-up buttons below to return to AutoForge_
```

**Implementation:**
```typescript
// In handleGenerate() and handleAsk()
await renderContextReferences(stream, contextInfo); // Already shows details

stream.markdown(`\n🚀 **Forwarding to @workspace** with enriched KB context`);
stream.markdown(` (${featureCount} features · ${componentCount} components · ${(contextSize/1024).toFixed(1)} KB)\n\n`);
stream.markdown(`_Use follow-up buttons below to return to AutoForge_\n`);
```

**Files to modify:**
- `src/chatParticipant.ts` - handleGenerate(), handleAsk()

**Estimated effort:** 1 hour

---

## 🟡 Medium Priority (Enhanced Usability)

### 4. Add Command Aliases
**Problem:** Commands are verbose, users expect shortcuts like other CLI tools.

**Proposed Aliases:**
```
/g  → /generate
/e  → /explain
/a  → /analyze
/i  → /impact
/t  → /trace
/s  → /scan
/f  → /features
```

**Implementation:**
```typescript
// In registerChatParticipant()
const commandAliases: Record<string, string> = {
    'g': 'generate',
    'e': 'explain',
    'a': 'analyze',
    'i': 'impact',
    't': 'trace',
    's': 'scan',
    'f': 'features'
};

// Resolve alias before switch
const resolvedCommand = commandAliases[request.command] || request.command;

switch (resolvedCommand) {
    case 'scan': ...
    case 'generate': ...
    // etc.
}
```

**Files to modify:**
- `src/chatParticipant.ts` - registerChatParticipant()
- `package.json` - Update command descriptions to show aliases

**Estimated effort:** 2 hours

---

### 5. Improve "Continue from where we left off"
**Problem:** Vague prompt doesn't show what user was working on.

**Current:**
```
User: "Continue from where we left off"
→ Generic response without context recap
```

**Proposed:**
```
User: "Continue from where we left off"
AutoForge:
## 📝 Continuing from Last Session

**Last Discussion:**
- You asked about: "Generate unit tests for LayoutEngine"
- @workspace generated: 3 test files with 12 test cases
- KB Context used: useLayoutEngine hook, ComponentFactory

**What's Next?**
[Analyze Generated Code] [Add More Tests] [Explain Generated Tests]
```

**Implementation:**
```typescript
async function handleQuestion(request, ...) {
    const prompt = request.prompt.toLowerCase();
    
    if (prompt.includes('continue') && prompt.includes('left off')) {
        const session = await sessionManager.getCurrentSession(workspaceFolder);
        const lastTurns = session.conversationHistory.slice(-6);
        
        stream.markdown('## 📝 Continuing from Last Session\n\n');
        stream.markdown('**Last Discussion:**\n');
        
        // Show last user request
        const lastUserTurn = lastTurns.reverse().find(t => t.role === 'user');
        if (lastUserTurn) {
            stream.markdown(`- You asked about: "${lastUserTurn.content.substring(0, 100)}..."\n`);
        }
        
        // Show what context was used
        if (lastUserTurn?.contextUsed) {
            stream.markdown(`- KB Context: ${lastUserTurn.contextUsed.features.join(', ')}\n`);
        }
        
        // Show what commands were run
        const commandsUsed = lastTurns.filter(t => t.command).map(t => t.command);
        if (commandsUsed.length > 0) {
            stream.markdown(`- Commands used: ${commandsUsed.join(', ')}\n`);
        }
        
        stream.markdown('\n**What\'s Next?**\n');
        // Add contextual follow-up buttons
        
        return { hasCode: false };
    }
    
    // Continue with normal question handling...
}
```

**Files to modify:**
- `src/chatParticipant.ts` - handleQuestion()
- `src/SessionManager.ts` - Add getSessionSummary()

**Estimated effort:** 3 hours

---

### 6. Add Disambiguation UI for Multiple Matches
**Problem:** When query matches multiple features, shows all without letting user choose.

**Current:**
```
User: @autoforge /explain Layout
→ Shows combined info for "LayoutService", "LayoutBuilder", "LayoutEngine"
→ User wanted only "LayoutService"
```

**Proposed:**
```
User: @autoforge /explain Layout
AutoForge:
⚠️ Found 3 features matching "Layout":

1. 📦 **LayoutService** (backend/Java) - 8 components
2. 🏗️ **LayoutBuilder** (backend/Java) - 4 components  
3. ⚙️ **LayoutEngine** (frontend/TypeScript) - 12 components

Which would you like me to explain? (Reply with number or feature name)
```

**Implementation:**
```typescript
async function handleExplain(request, ...) {
    const query = request.prompt.trim();
    const features = await kbManager.searchFeatures(query, 10);
    
    // If 2-5 matches, ask for disambiguation
    if (features.length >= 2 && features.length <= 5) {
        stream.markdown(`⚠️ Found ${features.length} features matching "${query}":\n\n`);
        
        features.forEach((f, idx) => {
            const icon = getLanguageIcon(f.languages[0]);
            stream.markdown(`${idx + 1}. ${icon} **${f.name}** (${f.languages.join('/')}) - ${f.componentCount} components\n`);
        });
        
        stream.markdown('\nWhich would you like me to explain? Reply with:\n');
        stream.markdown('- Number (e.g., "1")\n');
        stream.markdown('- Feature name (e.g., "LayoutService")\n');
        stream.markdown('- "all" to explain all\n');
        
        // Store matches in session for next turn
        await sessionManager.storePendingDisambiguation(features);
        return { hasCode: false };
    }
    
    // Single match or >5 matches: proceed as normal
    // ...
}
```

**Files to modify:**
- `src/chatParticipant.ts` - handleExplain(), handleQuestion()
- `src/SessionManager.ts` - Add storePendingDisambiguation(), getPendingDisambiguation()

**Estimated effort:** 4 hours

---

## 🟢 Low Priority (Nice to Have)

### 7. Show KB Staleness Indicator
**Problem:** Users don't know if KB is up-to-date with recent code changes.

**Proposed:**
```markdown
### Used 3 references
(Last scan: 2 hours ago - 47 files modified since)

**KB Features (2):**
- Router Management (15 components)
- Layout Engine (12 components)
```

**Implementation:**
- Track last scan timestamp in KB metadata
- Compare with file modification times
- Show warning if >X files changed since scan

**Estimated effort:** 2 hours

---

### 8. Session Export to Markdown
**Problem:** Users can't easily share or archive conversation sessions.

**Proposed Command:** `/export-session`

**Output Example:**
```markdown
# AutoForge Session - January 31, 2026

## Session Info
- Workspace: codebase-assistant
- Duration: 45 minutes
- Total turns: 12
- KB features used: 5

## Conversation

### User (10:30 AM)
@autoforge explain this project

### AutoForge (10:30 AM)
This project is a multi-language codebase...
(KB Context: Router Management, Layout Engine)

[... rest of conversation ...]
```

**Estimated effort:** 3 hours

---

## Implementation Priority Order

### Sprint 1 (Critical - 8 hours)
1. ✅ Auto-capture @workspace output (4h)
2. ✅ Smart fallbacks for /analyze (3h)
3. ✅ Condense handoff messages (1h)

### Sprint 2 (Enhanced UX - 9 hours)
4. ✅ Command aliases (2h)
5. ✅ Improve "continue" command (3h)
6. ✅ Disambiguation UI (4h)

### Sprint 3 (Polish - 5 hours)
7. ✅ KB staleness indicator (2h)
8. ✅ Session export (3h)

---

## Success Metrics

**Sprint 1:**
- 90% of `/analyze` commands succeed without "No code found" error
- @workspace handoff messages <3 lines
- Users can analyze @workspace output without extra steps

**Sprint 2:**
- 50% of users use command aliases within first week
- "Continue" command shows relevant context 100% of time
- Disambiguation reduces incorrect explanations by 80%

**Sprint 3:**
- Users can identify stale KB within 2 seconds
- 30% of users export at least one session per week

---

## Technical Debt & Refactoring

### Consider for Future:
- Extract handoff logic to separate module (`WorkspaceIntegration.ts`)
- Create `CommandRouter.ts` for cleaner command handling
- Add unit tests for all new fallback logic
- Implement telemetry for command usage patterns

---

**Last Updated:** January 31, 2026  
**Status:** Planning Phase  
**Branch:** story-3-chat-participant
