import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { HandlerResult } from '../types';
import { getCodeSelection } from '../utilities/helpers';

export async function handleAnalyze(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<HandlerResult> {
    // Smart fallback: chat references → active editor selection → active editor full file
    let selection = await getCodeSelection(request.references);
    
    if (!selection) {
        stream.markdown('⚠️ No code found to analyze.\n\n');
        stream.markdown('💡 **Try:**\n');
        stream.markdown('- Select code in the editor\n');
        stream.markdown('- Use `#file` to add a file\n');
        stream.markdown('- Use `#selection` with "Add Selection to Chat"\n');
        stream.markdown('- Open a file in the editor and run `/analyze` again\n');
        return { hasCode: false };
    }

    stream.progress('Analyzing code...');

    try {
        const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
        const fileName = selection.document.uri.fsPath.split('/').pop();
        
        // Show comprehensive analysis
        stream.markdown(`# Code Analysis\n\n`);
        stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
        stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n`);
        stream.markdown(`**Language:** ${analysis.language}\n\n`);

        if (analysis.relatedFeatures.length > 0) {
            stream.markdown(`## 🎯 Related Features (${analysis.relatedFeatures.length})\n\n`);
            for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                const confidence = (feature.confidence * 100).toFixed(0);
                stream.markdown(`- **${feature.name}** (${confidence}% confidence)\n`);
            }
            stream.markdown(`\n`);
        }

        if (analysis.relatedComponents.length > 0) {
            stream.markdown(`## 🧩 Related Components (${analysis.relatedComponents.length})\n\n`);
            for (const comp of analysis.relatedComponents.slice(0, 10)) {
                const link = vscode.Uri.file(comp.filePath);
                stream.markdown(`- [${comp.name}](${link.toString()}) (${comp.type})\n`);
                stream.reference(link);
            }
            stream.markdown(`\n`);
        }

        if (analysis.imports.length > 0) {
            stream.markdown(`## 📦 Dependencies (${analysis.imports.length})\n\n`);
            const importList = analysis.imports.slice(0, 15).map(imp => `- \`${imp}\``).join('\n');
            stream.markdown(importList + '\n\n');
        }

        if (analysis.methodCalls.length > 0) {
            stream.markdown(`## 🔧 Method Calls (${analysis.methodCalls.length})\n\n`);
            const callList = analysis.methodCalls.slice(0, 20).map(call => `- \`${call}()\``).join('\n');
            stream.markdown(callList + '\n\n');
        }

        if (analysis.typesReferenced.length > 0) {
            stream.markdown(`## 📋 Types Referenced (${analysis.typesReferenced.length})\n\n`);
            const typeList = analysis.typesReferenced.slice(0, 15).map(type => `- \`${type}\``).join('\n');
            stream.markdown(typeList + '\n\n');
        }

        if (analysis.relatedFiles.length > 0) {
            stream.markdown(`## 📁 Related Files (${analysis.relatedFiles.length})\n\n`);
            for (const file of analysis.relatedFiles.slice(0, 10)) {
                const uri = vscode.Uri.file(file);
                const fileName = file.split('/').pop();
                stream.markdown(`- [${fileName}](${uri.toString()})\n`);
                stream.reference(uri);
            }
            stream.markdown(`\n`);
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}
