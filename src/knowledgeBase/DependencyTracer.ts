import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ClassInfo {
    filePath: string;
    className: string;
    type: 'controller' | 'service' | 'repository' | 'component' | 'config';
    language: string;
    content: string;
    dependencies: string[];
}

export class DependencyTracer {
    private classMap: Map<string, ClassInfo> = new Map();

    async buildClassMap(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace open');
        }

        const patterns = [
            '**/*.java',
            '**/*.ts',
            '**/*.tsx',
            '**/*.js',
            '**/*.jsx'
        ];

        const allFiles: vscode.Uri[] = [];
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolders[0], pattern),
                '**/node_modules/**',
                200
            );
            allFiles.push(...files);
        }

        for (const fileUri of allFiles) {
            try {
                const content = await fs.readFile(fileUri.fsPath, 'utf-8');
                const classInfo = this.parseFile(fileUri.fsPath, content);
                if (classInfo) {
                    this.classMap.set(classInfo.className, classInfo);
                }
            } catch (error) {
                console.error(`Failed to parse ${fileUri.fsPath}:`, error);
            }
        }

        console.log(`Built class map with ${this.classMap.size} classes`);
    }

    private parseFile(filePath: string, content: string): ClassInfo | null {
        const fileName = path.basename(filePath);
        if (fileName.includes('.test.') || 
            fileName.includes('.spec.') || 
            fileName.includes('extension.')) {
            return null;
        }

        const language = this.detectLanguage(filePath);
        const className = this.extractClassName(content, language);
        if (!className) return null;

        const type = this.detectComponentType(content, filePath);
        const dependencies = this.extractDependencies(content, language);

        return {
            filePath,
            className,
            type,
            language,
            content,
            dependencies
        };
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath);
        const langMap: { [key: string]: string } = {
            '.java': 'java',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript'
        };
        return langMap[ext] || 'unknown';
    }

    private extractClassName(content: string, language: string): string | null {
        const patterns = [
            /(?:public\s+)?class\s+(\w+)/,
            /export\s+(?:class|function)\s+(\w+)/,
            /export\s+const\s+(\w+)\s*[:=]/
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    private detectComponentType(content: string, filePath: string): ClassInfo['type'] {
        const fileName = path.basename(filePath).toLowerCase();
        
        if (fileName.includes('controller') || fileName.includes('router')) {
            return 'controller';
        }
        if (fileName.includes('service')) {
            return 'service';
        }
        if (fileName.includes('repository') || fileName.includes('dao')) {
            return 'repository';
        }
        if (fileName.includes('config')) {
            return 'config';
        }

        const controllerPatterns = [
            /@RestController/,
            /@Controller/,
            /Router\(\)/
        ];

        const servicePatterns = [
            /@Service/,
            /@Injectable/
        ];

        const repositoryPatterns = [
            /@Repository/,
            /extends.*Repository/
        ];

        if (controllerPatterns.some(p => p.test(content))) return 'controller';
        if (servicePatterns.some(p => p.test(content))) return 'service';
        if (repositoryPatterns.some(p => p.test(content))) return 'repository';

        return 'component';
    }

    private extractDependencies(content: string, language: string): string[] {
        const dependencies: string[] = [];

        const constructorPatterns = [
            /@Autowired[\s\S]*?private\s+(?:final\s+)?(\w+)\s+\w+/g,
            /private\s+final\s+(\w+)\s+\w+/g,
            /constructor\s*\([^)]*?(\w+):\s*(\w+)/g
        ];

        for (const pattern of constructorPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const typeName = match[match.length - 1];
                if (typeName && typeName.length > 1) {
                    dependencies.push(typeName);
                }
            }
        }

        return [...new Set(dependencies)];
    }
}
