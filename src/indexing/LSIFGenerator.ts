import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export type ProjectType = 'java-maven' | 'java-gradle' | 'typescript' | 'javascript' | 'unknown';

export interface LSIFGenerationConfig {
    autoGenerate: boolean;
    generateOnStartup: boolean;
    generateOnBuild: boolean;
    outputPath: string;
    incrementalUpdate: boolean;
}

export interface GenerationResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    duration?: number;
}

/**
 * Automatically generates LSIF dumps for projects
 * Detects project type and runs appropriate LSIF indexer
 */
export class LSIFGenerator {
    private config: LSIFGenerationConfig;
    private isGenerating: boolean = false;
    private lastGenerationTime: Map<string, number> = new Map();
    private fileWatchers: vscode.FileSystemWatcher[] = [];

    constructor(config?: Partial<LSIFGenerationConfig>) {
        this.config = {
            autoGenerate: true,
            generateOnStartup: false,
            generateOnBuild: true,
            outputPath: 'lsif-output',
            incrementalUpdate: true,
            ...config
        };
    }

    /**
     * Initialize auto-generation with file watching
     */
    async initialize(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        if (!this.config.autoGenerate) {
            console.log('LSIF auto-generation is disabled');
            return;
        }

        // Generate on startup if configured
        if (this.config.generateOnStartup) {
            await this.generateForWorkspace(workspaceFolder);
        }

        // Watch for build events
        if (this.config.generateOnBuild) {
            this.watchForBuildEvents(workspaceFolder);
        }

        // Watch for significant file changes
        if (this.config.incrementalUpdate) {
            this.watchForFileChanges(workspaceFolder);
        }
    }

    /**
     * Detect project type from workspace
     */
    async detectProjectType(workspaceFolder: vscode.WorkspaceFolder): Promise<ProjectType> {
        const rootPath = workspaceFolder.uri.fsPath;

        // Check for Java Maven
        if (fs.existsSync(path.join(rootPath, 'pom.xml'))) {
            return 'java-maven';
        }

        // Check for Java Gradle
        if (fs.existsSync(path.join(rootPath, 'build.gradle')) ||
            fs.existsSync(path.join(rootPath, 'build.gradle.kts'))) {
            return 'java-gradle';
        }

        // Check for TypeScript
        if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
            return 'typescript';
        }

        // Check for JavaScript (npm/package.json)
        if (fs.existsSync(path.join(rootPath, 'package.json'))) {
            const packageJson = JSON.parse(
                fs.readFileSync(path.join(rootPath, 'package.json'), 'utf-8')
            );
            // Check if it's actually TypeScript by looking at dependencies
            if (packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript) {
                return 'typescript';
            }
            return 'javascript';
        }

        return 'unknown';
    }

    /**
     * Check if required LSIF tools are installed
     */
    async checkToolsInstalled(projectType: ProjectType): Promise<{
        installed: boolean;
        tool: string;
        installCommand?: string;
    }> {
        try {
            switch (projectType) {
                case 'java-maven':
                case 'java-gradle':
                    try {
                        await execAsync('lsif-java --version');
                        return { installed: true, tool: 'lsif-java' };
                    } catch {
                        return {
                            installed: false,
                            tool: 'lsif-java',
                            installCommand: 'npm install -g @sourcegraph/lsif-java'
                        };
                    }

                case 'typescript':
                case 'javascript':
                    try {
                        await execAsync('lsif-tsc --version');
                        return { installed: true, tool: 'lsif-tsc' };
                    } catch {
                        return {
                            installed: false,
                            tool: 'lsif-tsc',
                            installCommand: 'npm install -g lsif-tsc'
                        };
                    }

                default:
                    return { installed: false, tool: 'unknown' };
            }
        } catch (error) {
            return { installed: false, tool: 'unknown' };
        }
    }

    /**
     * Generate LSIF dump for a workspace
     */
    async generateForWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<GenerationResult> {
        if (this.isGenerating) {
            console.log('LSIF generation already in progress');
            return { success: false, error: 'Generation already in progress' };
        }

        this.isGenerating = true;
        const startTime = Date.now();

        try {
            // Detect project type
            const projectType = await this.detectProjectType(workspaceFolder);
            if (projectType === 'unknown') {
                console.log('Unknown project type, skipping LSIF generation');
                return { success: false, error: 'Unknown project type' };
            }

            console.log(`Detected project type: ${projectType}`);

            // Check if tools are installed
            const toolCheck = await this.checkToolsInstalled(projectType);
            if (!toolCheck.installed) {
                const message = `LSIF tool not installed: ${toolCheck.tool}\nInstall with: ${toolCheck.installCommand}`;
                console.log(message);
                
                // Offer to install
                const install = await vscode.window.showInformationMessage(
                    `AutoForge can generate optimized code intelligence with LSIF. Install ${toolCheck.tool}?`,
                    'Install', 'Skip', 'Don\'t Ask Again'
                );

                if (install === 'Install') {
                    await this.installTool(toolCheck.tool, toolCheck.installCommand!);
                } else if (install === 'Don\'t Ask Again') {
                    this.config.autoGenerate = false;
                }

                return { success: false, error: 'Tool not installed' };
            }

            // Create output directory
            const outputDir = path.join(workspaceFolder.uri.fsPath, this.config.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Generate LSIF
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AutoForge: Generating LSIF index...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'This may take a few minutes for large projects' });
                
                const result = await this.runGenerator(projectType, workspaceFolder, outputDir);
                
                if (result.success) {
                    vscode.window.showInformationMessage(
                        `✅ LSIF index generated successfully in ${Math.round((result.duration || 0) / 1000)}s`
                    );
                }
                
                return result;
            });

            const duration = Date.now() - startTime;
            this.lastGenerationTime.set(workspaceFolder.uri.fsPath, Date.now());

            return {
                success: true,
                outputPath: path.join(outputDir, 'dump.lsif'),
                duration
            };

        } catch (error) {
            console.error('LSIF generation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Run the appropriate LSIF generator
     */
    private async runGenerator(
        projectType: ProjectType,
        workspaceFolder: vscode.WorkspaceFolder,
        outputDir: string
    ): Promise<GenerationResult> {
        const startTime = Date.now();
        const rootPath = workspaceFolder.uri.fsPath;

        try {
            let command: string;
            const outputFile = path.join(outputDir, 'dump.lsif');

            switch (projectType) {
                case 'java-maven':
                    command = `cd "${rootPath}" && lsif-java index --output "${outputFile}"`;
                    break;

                case 'java-gradle':
                    command = `cd "${rootPath}" && lsif-java index --build-tool gradle --output "${outputFile}"`;
                    break;

                case 'typescript':
                    command = `cd "${rootPath}" && lsif-tsc -p tsconfig.json --out "${outputFile}"`;
                    break;

                case 'javascript':
                    command = `cd "${rootPath}" && lsif-tsc --out "${outputFile}"`;
                    break;

                default:
                    return { success: false, error: 'Unsupported project type' };
            }

            console.log(`Running LSIF generator: ${command}`);
            
            const { stdout, stderr } = await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
                timeout: 300000 // 5 minute timeout
            });

            if (stderr) {
                console.log('LSIF generator stderr:', stderr);
            }

            const duration = Date.now() - startTime;
            console.log(`LSIF generation completed in ${duration}ms`);

            return {
                success: true,
                outputPath: outputFile,
                duration
            };

        } catch (error) {
            console.error('LSIF generation error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Install LSIF tool
     */
    private async installTool(tool: string, installCommand: string): Promise<void> {
        try {
            const terminal = vscode.window.createTerminal('LSIF Tool Installation');
            terminal.show();
            terminal.sendText(installCommand);
            
            vscode.window.showInformationMessage(
                `Installing ${tool}... Please wait for installation to complete in the terminal.`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to install ${tool}: ${error}`);
        }
    }

    /**
     * Watch for build events
     */
    private watchForBuildEvents(workspaceFolder: vscode.WorkspaceFolder): void {
        // Watch for Maven/Gradle build artifacts
        const buildWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '{target/**,build/**}')
        );

        buildWatcher.onDidChange(async () => {
            // Debounce: Only regenerate if it's been more than 5 minutes
            const lastGen = this.lastGenerationTime.get(workspaceFolder.uri.fsPath) || 0;
            if (Date.now() - lastGen > 5 * 60 * 1000) {
                console.log('Build artifacts changed, regenerating LSIF...');
                await this.generateForWorkspace(workspaceFolder);
            }
        });

        this.fileWatchers.push(buildWatcher);
    }

    /**
     * Watch for significant file changes
     */
    private watchForFileChanges(workspaceFolder: vscode.WorkspaceFolder): void {
        // Watch for Java/TypeScript file changes
        const sourceWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '**/*.{java,ts,tsx,js,jsx}')
        );

        let changedFiles = 0;
        let debounceTimer: NodeJS.Timeout | null = null;

        const handleChange = () => {
            changedFiles++;

            // Clear existing timer
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // Regenerate if more than 10 files changed or after 30 seconds of inactivity
            if (changedFiles >= 10) {
                this.triggerRegeneration(workspaceFolder);
                changedFiles = 0;
            } else {
                debounceTimer = setTimeout(() => {
                    if (changedFiles > 0) {
                        this.triggerRegeneration(workspaceFolder);
                        changedFiles = 0;
                    }
                }, 30000); // 30 seconds
            }
        };

        sourceWatcher.onDidChange(handleChange);
        sourceWatcher.onDidCreate(handleChange);
        sourceWatcher.onDidDelete(handleChange);

        this.fileWatchers.push(sourceWatcher);
    }

    /**
     * Trigger LSIF regeneration with rate limiting
     */
    private async triggerRegeneration(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        const lastGen = this.lastGenerationTime.get(workspaceFolder.uri.fsPath) || 0;
        const minInterval = 5 * 60 * 1000; // 5 minutes minimum between generations

        if (Date.now() - lastGen < minInterval) {
            console.log('LSIF regeneration skipped (too soon)');
            return;
        }

        console.log('Triggering LSIF regeneration due to file changes...');
        await this.generateForWorkspace(workspaceFolder);
    }

    /**
     * Manually trigger generation (for user command)
     */
    async regenerate(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        const folder = workspaceFolder || vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        await this.generateForWorkspace(folder);
    }

    /**
     * Get generation status
     */
    getStatus(): {
        isGenerating: boolean;
        lastGenerationTimes: Map<string, number>;
        config: LSIFGenerationConfig;
    } {
        return {
            isGenerating: this.isGenerating,
            lastGenerationTimes: this.lastGenerationTime,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<LSIFGenerationConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Dispose watchers
     */
    dispose(): void {
        for (const watcher of this.fileWatchers) {
            watcher.dispose();
        }
        this.fileWatchers = [];
    }
}
