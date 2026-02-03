# AutoForge - Testing Guide

## 🧪 Quick Test Scenarios

### Setup
1. Ensure AutoForge extension is compiled: `npm run compile`
2. Press F5 to launch Extension Development Host
3. Open a workspace with Java/TypeScript code
4. Run `@autoforge /scan` to index workspace

---

## Test 1: Context Detection via Chat References

### Test 1A: `/explain` with #file
1. Open Copilot Chat (Ctrl+Shift+I)
2. Type `#file` and select a source file (e.g., `MessageHandler.ts`)
3. Type `@autoforge /explain`
4. **Expected:** Analysis of the entire file without needing to select anything

### Test 1B: `/analyze` with #selection
1. Select a code block in editor (e.g., a method)
2. Right-click → "Add Selection to Chat"
3. In chat, type `@autoforge /analyze`
4. **Expected:** Dependency analysis of selected code
5. **Expected:** 4 follow-up buttons appear at bottom

### Test 1C: `/trace` with active editor selection
1. Select code in editor (without adding to chat)
2. Type `@autoforge /trace`
3. **Expected:** Dependency trace using editor selection (fallback behavior)

---

## Test 2: Interactive Follow-Up Buttons

### Test 2A: "Tell Me More" Button
1. Run `@autoforge /analyze` on a complex method
2. Wait for analysis to complete
3. Click **"🔍 Tell Me More"** button
4. **Expected:** New chat opens with enhanced prompt asking for deeper explanation

### Test 2B: "Give Examples" Button
1. Run `@autoforge /explain` on a utility class
2. Click **"📚 Give Examples"** button
3. **Expected:** Chat opens with prompt requesting code examples and usage patterns

### Test 2C: "Explain Architecture" Button
1. Run `@autoforge /trace` on a service component
2. Click **"🏗️ Explain Architecture"** button
3. **Expected:** Architectural design explanation request in new chat

### Test 2D: "Show Best Practices" Button
1. Run `@autoforge /impact` on a controller
2. Click **"🎯 Show Best Practices"** button
3. **Expected:** Best practices recommendations prompt in chat

---

## Test 3: Edge Cases

### Test 3A: No Context Available
1. Don't select anything, don't add files
2. Run `@autoforge /analyze`
3. **Expected:** Helpful tip message about using `#file` or `#selection`

### Test 3B: Multiple References
1. Add multiple files via `#file`
2. Run `@autoforge /explain`
3. **Expected:** Uses first file reference

### Test 3C: Both File and Selection
1. Add `#file` to chat
2. Also add `#selection` to chat
3. Run `@autoforge /trace`
4. **Expected:** Selection takes precedence (more specific context)

---

## Test 4: All Commands Updated

### Commands to Test:
- ✅ `/explain` - Should have context detection + buttons
- ✅ `/analyze` - Should have context detection + buttons
- ✅ `/trace` - Should have context detection + buttons
- ✅ `/impact` - Should have context detection + buttons

### Unchanged Commands:
- `/scan` - Index workspace (no changes)
- `/features` - List features (no changes)
- `/stats` - Show statistics (no changes)
- `/reset` - Reset KB (no changes)
- `/sessions` - List sessions (no changes)
- `/session` - Switch session (no changes)

---

## Test 5: Integration Test

### Full Workflow:
1. **Index workspace:** `@autoforge /scan`
2. **Add file to chat:** Type `#file`, select `MessageRouter.java`
3. **Explain:** `@autoforge /explain`
   - ✅ Should show detailed explanation of the file
   - ✅ Should show 4 follow-up buttons
4. **Click "Tell Me More":**
   - ✅ Should open new chat with enhanced prompt
   - ✅ Should include code snippet in prompt
5. **Select a method in editor**
6. **Analyze:** `@autoforge /analyze`
   - ✅ Should detect editor selection (no need to add to chat)
   - ✅ Should show dependency analysis
   - ✅ Should show follow-up buttons
7. **Click "Give Examples":**
   - ✅ Should open chat with example request

---

## Expected Output Format

### Analysis with Follow-Up Buttons:
```
## 🔍 Code Analysis

**File:** src/MessageRouter.java
**Lines:** 10-45

### 📊 Analysis Results
[... analysis content ...]

---

### 💡 Explore Further

[🔍 Tell Me More] [📚 Give Examples] [🏗️ Explain Architecture] [🎯 Show Best Practices]
```

### Follow-Up Chat:
```
@autoforge Based on the previous analyze analysis, provide a more detailed explanation. 
Include implementation details, edge cases, and technical considerations.

Code:
```
[code snippet]
```
```

---

## Debugging Tips

### If context detection fails:
1. Check console: "Selection analyzer detected: ..."
2. Verify `getCodeSelection()` returns non-null
3. Check `extractContextFromReferences()` output

### If buttons don't appear:
1. Verify `showFollowUpButtons()` is called
2. Check stream.button() API usage
3. Ensure context object is passed correctly

### If button clicks do nothing:
1. Check command registration in extension.ts
2. Verify command IDs match in package.json
3. Check console for command execution errors

---

## Performance Expectations

- **Context detection:** < 100ms
- **Analysis with buttons:** < 3s for medium files
- **Follow-up prompt generation:** < 50ms
- **Button click response:** < 200ms (chat open time)

---

## Success Criteria

✅ All 4 commands support chat references  
✅ Fallback to editor selection works  
✅ All 4 buttons appear after analysis  
✅ Button clicks open chat with correct prompts  
✅ No compilation errors or warnings  
✅ Tip messages mention `#file` / `#selection`  

---

**Ready to test? Press F5 and start with Test 1A!** 🚀
