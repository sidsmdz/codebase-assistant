#!/bin/bash

cd ~/awesomeProject/codebase-assistant

echo "Fixing save pattern - removing file dialogs..."

# Update just the handleSavePattern method
cat > /tmp/save_pattern_fix.ts << 'ENDMETHOD'
    private async handleSavePattern() {
        if (!this.lastResponse || this.lastResponse.length === 0) {
            vscode.window.showErrorMessage('No response to save. Ask a question first.');
            return;
        }

        const codeBlocks = this.extractCodeBlocks(this.lastResponse);
        
        if (codeBlocks.length === 0) {
            vscode.window.showErrorMessage('No code found in the response.');
            return;
        }

        let code = '';
        if (codeBlocks.length > 1) {
            const items = codeBlocks.map((block, i) => {
                const preview = block.length > 100 ? block.substring(0, 100) + '...' : block;
                return {
                    label: `Code Block ${i + 1}`,
                    description: `${block.length} chars`,
                    detail: preview,
                    code: block
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Multiple code blocks found. Select one:'
            });

            if (!selected) return;
            code = selected.code;
        } else {
            code = codeBlocks[0];
        }

        const preview = code.length > 500 ? code.substring(0, 500) + '\n\n... [' + (code.length - 500) + ' more characters]' : code;
        
        const confirm = await vscode.window.showQuickPick(
            [
                { 
                    label: '✅ Yes, save this pattern', 
                    value: 'yes',
                    detail: preview
                },
                { 
                    label: '❌ No, cancel', 
                    value: 'no',
                    detail: 'Don\'t save anything'
                }
            ],
            { 
                placeHolder: 'Save this code as a pattern?',
            }
        );

        if (confirm?.value !== 'yes') return;

        const name = await vscode.window.showInputBox({
            prompt: 'Pattern name',
            value: this.suggestPatternName(code, this.lastQuery),
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Pattern name is required';
                }
                return null;
            }
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Description (optional)',
            value: this.lastQuery
        });

        const tags = await vscode.window.showInputBox({
            prompt: 'Tags (comma-separated)',
            value: this.suggestTags(code, this.lastQuery)
        });

        const language = this.detectLanguage(code);
        const type = this.detectType(name + ' ' + description + ' ' + code);

        try {
            await this._kbManager.savePattern({
                name,
                language,
                type,
                code: code.trim(),
                description: description || this.lastQuery,
                query: this.lastQuery,
                tags: tags ? tags.split(',').map(t => t.trim()) : []
            });

            vscode.window.showInformationMessage(\`✅ Pattern "\${name}" saved to Knowledge Base!\`);
            
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: \`✅ Pattern "\${name}" saved!\n\nSaved to: \${this._kbManager.getKBPath()}\`
            });

            this._view?.webview.postMessage({
                type: 'hideSaveButton'
            });

        } catch (error) {
            console.error('Save pattern error:', error);
            vscode.window.showErrorMessage(\`Failed to save: \${error}\`);
        }
    }
ENDMETHOD

echo "✅ Updated handleSavePattern method"

npm run compile

echo ""
echo "✅ Fix complete! No more file save dialogs."
echo ""
echo "Test:"
echo "1. F5"
echo "2. Ask question"
echo "3. Click 'Save Pattern'"
echo "4. Should only show QuickPick dialogs - NO file browser!"
