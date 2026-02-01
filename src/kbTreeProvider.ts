import * as vscode from 'vscode';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { Feature, FeatureComponent } from './analysis/FeatureAnalyzer';

/**
 * TreeDataProvider for the AutoForge Knowledge Base sidebar.
 * Shows KB stats, features, and their components in a tree structure.
 */
export class KBTreeProvider implements vscode.TreeDataProvider<KBTreeItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<KBTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private kbManager: KnowledgeBaseManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: KBTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: KBTreeItem): Promise<KBTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }
        if (element.contextValue === 'featureGroup') {
            return this.getFeatureItems();
        }
        if (element.contextValue === 'feature') {
            return this.getComponentItems(element.featureId!);
        }
        return [];
    }

    private async getRootItems(): Promise<KBTreeItem[]> {
        const stats = await this.kbManager.getStats();

        const items: KBTreeItem[] = [
            new KBTreeItem(
                `Indexed Files: ${stats.indexedFilesCount}`,
                vscode.TreeItemCollapsibleState.None,
                'stat',
                'file'
            ),
            new KBTreeItem(
                `Features: ${stats.featureCount}`,
                vscode.TreeItemCollapsibleState.None,
                'stat',
                'symbol-class'
            ),
            new KBTreeItem(
                `Components: ${stats.componentCount}`,
                vscode.TreeItemCollapsibleState.None,
                'stat',
                'symbol-method'
            ),
        ];

        // Add feature group if there are features
        if (stats.featureCount > 0) {
            items.push(new KBTreeItem(
                'Features',
                vscode.TreeItemCollapsibleState.Collapsed,
                'featureGroup',
                'list-tree'
            ));
        }

        return items;
    }

    private async getFeatureItems(): Promise<KBTreeItem[]> {
        const features = await this.kbManager.getAllFeatures();

        return features.map(f => {
            const item = new KBTreeItem(
                f.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'feature',
                'symbol-class'
            );
            item.featureId = f.id;
            item.description = `${f.languages.join(', ')} · ${f.components.length} components`;
            item.tooltip = new vscode.MarkdownString(
                `**${f.name}**\n\n${f.description}\n\n` +
                `- Languages: ${f.languages.join(', ')}\n` +
                `- Components: ${f.components.length}\n` +
                `- Entry Points: ${f.entryPoints.length}\n` +
                `- Frameworks: ${f.frameworks.join(', ') || 'none'}`
            );
            return item;
        });
    }

    private async getComponentItems(featureId: string): Promise<KBTreeItem[]> {
        const components = await this.kbManager.getComponentsForFeature(featureId);
        const feature = await this.kbManager.getFeatureById(featureId);
        const entryPointIds = new Set(feature?.entryPoints || []);

        // Sort: entry points first, then by type
        const sorted = [...components].sort((a, b) => {
            const aEntry = entryPointIds.has(a.id) ? 0 : 1;
            const bEntry = entryPointIds.has(b.id) ? 0 : 1;
            if (aEntry !== bEntry) { return aEntry - bEntry; }
            return a.type.localeCompare(b.type);
        });

        return sorted.map(c => {
            const isEntry = entryPointIds.has(c.id);
            const icon = isEntry ? 'zap' : this.getComponentIcon(c.type);

            const item = new KBTreeItem(
                c.name,
                vscode.TreeItemCollapsibleState.None,
                'component',
                icon
            );
            item.description = `${c.type}${isEntry ? ' ⚡' : ''} · ${c.language}`;
            item.tooltip = new vscode.MarkdownString(
                `**${c.name}** (${c.type})\n\n` +
                `- File: \`${c.filePath}\`\n` +
                `- Line: ${c.startLine}\n` +
                `- Language: ${c.language}\n` +
                (c.dependencies.length > 0
                    ? `- Dependencies: ${c.dependencies.join(', ')}\n`
                    : '')
            );

            // Click to open file at component line
            item.command = {
                command: 'vscode.open',
                title: 'Open Component',
                arguments: [
                    vscode.Uri.file(c.filePath),
                    { selection: new vscode.Range(c.startLine - 1, 0, c.startLine - 1, 0) }
                ]
            };

            return item;
        });
    }

    private getComponentIcon(type: string): string {
        switch (type) {
            case 'controller': return 'globe';
            case 'service': return 'gear';
            case 'repository': return 'database';
            case 'component': return 'browser';
            case 'hook': return 'link';
            case 'model': return 'symbol-structure';
            case 'factory': return 'wrench';
            case 'builder': return 'layers';
            case 'strategy': return 'split-horizontal';
            case 'observer': return 'eye';
            case 'singleton': return 'lock';
            case 'adapter': return 'plug';
            case 'api-client': return 'cloud';
            case 'event-handler': return 'bell';
            case 'middleware': return 'filter';
            case 'config': return 'settings-gear';
            case 'util': return 'tools';
            default: return 'symbol-misc';
        }
    }
}

class KBTreeItem extends vscode.TreeItem {
    featureId?: string;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public override contextValue: string,
        iconId: string
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon(iconId);
    }
}
