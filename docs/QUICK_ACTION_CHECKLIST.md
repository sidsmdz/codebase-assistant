# Quick Action Checklist: Enable Tool Execution

Based on your diagnostic feedback, here's exactly what to do next to make `@workspace` execute AutoForge tools automatically.

## 🎯 Immediate Actions (Choose One Path)

### Path A: Configure Auto-Approve (Recommended)

1. **Open User Settings JSON**
   - `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type: "Preferences: Open User Settings (JSON)"
   - Press Enter

2. **Add these lines:**
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

3. **Reload VS Code**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

4. **Test:**
   ```
   @workspace Can we refactor the PermissionService class?
   ```

**Expected:** Tool executes silently, no text display, immediate results.

---

### Path B: Check for Silent Approval Prompt

1. **Type in Copilot Chat:**
   ```
   @workspace Can we refactor the PermissionService class?
   ```

2. **Look carefully for a notification:**
   - **Top of chat window** - Small blue/yellow bar
   - **Bottom right** - Toast notification
   - **Message:** "Allow '@workspace' to use tool 'autoforge_analyzeImpact'?"

3. **Click "Always Allow"** (not just "Allow once")

4. **Tool should now execute automatically**

---

### Path C: Enable Tools in Chat UI

1. **Open Copilot Chat**

2. **Look for the "Configure Tools" icon:**
   - Near the chat input area
   - Gear icon ⚙️ or toolbox icon 🧰
   - Might be in the agent picker dropdown

3. **Click it → Check these boxes:**
   - ✅ autoforge_analyzeImpact
   - ✅ autoforge_findFeature
   - ✅ autoforge_verifyBridge

4. **Test again**

---

## 🔍 Diagnostic Commands

If still not working, run these to diagnose:

### Check Output Logs
```
View → Output → Select "GitHub Copilot Chat"
```
Look for:
- "Skipping 'autoforge_analyzeImpact' - User consent required"
- "Tool execution blocked"
- "Waiting for approval"

### Check Developer Console
```
Help → Toggle Developer Tools → Console tab
```
Filter for "autoforge" and look for error messages.

### Verify Workspace Trust
```
Click shield icon (bottom left) → Trust Workspace
```
Or: `Ctrl+Shift+P` → "Manage Workspace Trust" → Trust

---

## 🧪 Test Sequence

After configuration, test in this order:

### Test 1: Manual Tool (Baseline)
```
#autoforge_analyzeImpact symbolName="PermissionService"
```
**Must work:** If this fails, extension not loaded properly.

### Test 2: Hybrid Invocation (RECOMMENDED - WORKING!)
```
@workspace #autoforge_analyzeImpact refactor permission service
```
**This works!** Explicitly reference the tool in your @workspace prompt.
- Tool executes automatically
- @workspace uses the results
- You maintain control over when tools are invoked

### Test 3: Full Autonomous (Requires auto-approve settings)
```
@workspace Can we refactor the PermissionService class?
```
**Goal:** @workspace decides to call the tool on its own.
**Status:** Requires auto-approve settings (see Path A above)

### Test 4: Agent Mode with Verification Loop
```
@workspace #autoforge_verifyBridge refactor permission service to be more modular
```
**This works!** Tool validates proposed changes and returns SUCCESS/FAIL with specific errors.

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ **No text display** - Tool name doesn't show as code block
2. ✅ **Progress message** - "🔍 AutoForge is analyzing impact..."
3. ✅ **Immediate results** - Risk score, affected files, recommendations
4. ✅ **Informed answer** - `@workspace` bases response on actual data
5. ✅ **No prompts** - Tool executes silently in background

---

## 🆘 If Nothing Works

### Fallback Option: Use @autoforge Directly
```
@autoforge refactor PermissionService
```
This has built-in auto-detection and doesn't require approval.

### Or Use forceExecute Command
In system instructions, reference:
```typescript
vscode.commands.executeCommand('autoforge.forceExecute', 'analyzeImpact', 
  {symbolName: 'PermissionService'})
```

---

## 📋 What We Built

The complete Decision Engine architecture is now in place:

1. ✅ **System Instructions** - `.github/copilot-instructions.md`
2. ✅ **3 Language Model Tools** - Properly registered with enhanced descriptions
3. ✅ **Verification Loop** - Bridge validation for cross-language changes
4. ✅ **Auto-detection** - Built into @autoforge participant
5. ✅ **Silent Partner** - `forceExecute` command for approval bypass
6. ✅ **Recommended Settings** - `.vscode/settings.json`
7. ✅ **Troubleshooting Guide** - Complete diagnostic steps

---

## 🎉 Once Working

The workflow will be:

1. You: `@workspace refactor PermissionService`
2. System instructions: "MUST call analyzeImpact first"
3. Tool executes: Risk score, affected files, cross-language links
4. @workspace: "Based on impact analysis, this is RISKY because..."
5. You: "Generate the refactor"
6. @workspace: Generates changes
7. Verification loop: Calls verifyBridge to validate
8. @workspace: Presents synchronized, validated code

This is the autonomous "Decision Engine" we designed! 🚀

---

**Next:** Choose Path A (auto-approve) or Path B (check for prompt), then test with the 3-step sequence above.
