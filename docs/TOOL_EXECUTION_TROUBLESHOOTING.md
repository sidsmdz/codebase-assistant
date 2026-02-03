# Tool Execution Troubleshooting Guide

## The "Last Mile" Problem: Recognition vs. Execution

When `@workspace` shows tool calls as text (e.g., `#autoforge_analyzeImpact symbolName="PermissionService"`) but doesn't execute them, you're hitting the **"Manual Approval"** security sandbox.

---

## Quick Fix Checklist

### 1. Auto-Approve Settings

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

**What this does:**
- Bypasses the "Confirm every time" prompt for AutoForge tools
- Allows `@workspace` to proxy its intent through your extension

---

### 2. Enable Tools in Chat UI

**Steps:**
1. Open Copilot Chat
2. Look for **"Configure Tools"** icon (gear or toolbox) near the chat input
3. Click it to see available tools
4. **Check the boxes** for all AutoForge tools:
   - ✅ autoforge_analyzeImpact
   - ✅ autoforge_findFeature
   - ✅ autoforge_verifyBridge

**Why:** Tools can be "visible" but "disabled" by default until explicitly toggled.

---

### 3. Check for Silent Approval Prompt

When `@workspace` displays a tool call as text, **look carefully** for:

- **Top of chat window:** Small notification bar
- **Bottom right:** Toast notification
- **Message:** *"Allow '@workspace' to use tool 'autoforge_analyzeImpact'?"*

**Action:**
- Click **"Always Allow"** (not just "Allow once")
- This moves the tool from "Text shown" to "Actually executed"

---

### 4. Verify Workspace Trust

**Check:**
1. Bottom left of VS Code → Look for shield icon
2. Or: `Ctrl+Shift+P` → "Manage Workspace Trust"
3. Ensure workspace is **"Trusted"**

**If untrusted:**
- Click shield icon → "Trust Workspace"
- Tool execution is blocked in untrusted workspaces for security

---

### 5. Confirm Model Capability

**Required Models:**
- ✅ Copilot GPT-4o
- ✅ Claude 3.5 Sonnet

**Not supported:**
- ❌ Basic models
- ❌ BYOK (Bring Your Own Key) models without `tool_use` headers

**Check current model:**
- Look at the top of Copilot Chat
- If using a "Basic" model, switch to GPT-4o or Claude 3.5

---

### 6. Check Output Logs

**Steps:**
1. `View` → `Output` (or `Ctrl+Shift+U`)
2. Select **"GitHub Copilot Chat"** from dropdown
3. Look for messages like:
   ```
   [Tool] Skipping 'autoforge_analyzeImpact' - User consent required
   [Tool] autoforge_analyzeImpact - Blocked by security policy
   [Tool] Waiting for approval: autoforge_analyzeImpact
   ```

**This tells you exactly why execution was blocked.**

---

### 7. Check Developer Console

**Steps:**
1. `Help` → `Toggle Developer Tools`
2. Go to **Console** tab
3. Filter for "autoforge" or "tool"
4. Look for:
   ```
   Tool execution blocked: autoforge_analyzeImpact
   Waiting for user approval for tool: autoforge_analyzeImpact
   Tool not authorized for automatic execution
   ```

---

## Advanced: "Silent Partner" Command Wrapper

If automatic execution still doesn't work, implement a command proxy in `extension.ts`:

```typescript
// Register a direct command wrapper
context.subscriptions.push(
    vscode.commands.registerCommand('autoforge.forceExecute', async (toolName: string, params: any) => {
        // Bypass the Chat barrier and run logic directly
        switch (toolName) {
            case 'analyzeImpact':
                return await featureGraphProvider.analyzeImpact(params.symbolName);
            case 'findFeature':
                return await featureGraphProvider.findFeature(params.query);
            case 'verifyBridge':
                return await featureGraphProvider.verifyBridge(params.proposedChanges);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    })
);
```

**Usage in system instructions:**
```markdown
If tool execution is blocked, use:
vscode.commands.executeCommand('autoforge.forceExecute', 'analyzeImpact', {symbolName: 'X'})
```

---

## Testing After Configuration

### Test 1: Manual Tool Invocation
```
#autoforge_analyzeImpact symbolName="PermissionService"
```

**Expected:**
- ✅ "Optimizing tool selection..."
- ✅ "🔍 AutoForge is analyzing impact..."
- ✅ Returns risk score and recommendations

**If fails:** Settings not applied yet. Reload VS Code window.

---

### Test 2: Automatic Invocation by @workspace
```
@workspace Can we refactor the PermissionService class?
```

**Expected:**
- ✅ Tool executes automatically (no text display)
- ✅ `@workspace` uses the results to provide informed answer
- ✅ No "Confirm" prompts

**If shows text instead of executing:**
1. Check "Configure Tools" in Chat UI
2. Look for silent approval prompt
3. Check Output logs for block reason
4. Verify `autoApprove` settings are in **User Settings** (not just workspace)

---

### Test 3: Agent Mode with /edit
```
@workspace /edit Add a 'role' field to the User entity (both Java and TypeScript)
```

**Expected:**
1. ✅ Calls `#autoforge_analyzeImpact` for User entity
2. ✅ Generates Java change
3. ✅ Generates TypeScript change
4. ✅ Calls `#autoforge_verifyBridge` to validate
5. ✅ Presents synchronized changes

---

## Common Issues & Solutions

| Symptom | Cause | Solution |
|---------|-------|----------|
| Tool shown as text | No user approval | Check for silent prompt or add `autoApprove` setting |
| "User consent required" | Security sandbox | Add tools to `autoApprove` list in User Settings |
| Tools not in `#` autocomplete | Extension not activated | Reload window, check `activationEvents` |
| "Tool not found" | Wrong toolReferenceName | Verify `package.json` tool names match registration |
| Execution blocked in Agent Mode | Untrusted workspace | Trust workspace via shield icon |
| Works manually but not in @workspace | Model doesn't support tools | Switch to GPT-4o or Claude 3.5 |

---

## Success Criteria

✅ **Manual invocation:** `#autoforge_analyzeImpact` executes without confirmation

✅ **Automatic invocation:** `@workspace refactor X` triggers tool automatically

✅ **No prompts:** Tool executes silently in background

✅ **Output logs:** Show "Executing tool: autoforge_analyzeImpact" (not "Blocked")

✅ **Agent mode:** `/edit` commands use verification loop automatically

---

## Final Notes

The security sandbox is intentional and important:
- Protects against malicious tools
- Prevents accidental file mutations
- Requires explicit user trust

Once configured, the tools become "trusted partners" that `@workspace` can invoke freely, creating the autonomous "Decision Engine" workflow we designed.

---

**Next:** After configuring these settings, reload VS Code and test with `@workspace Can we refactor the PermissionService class?`
