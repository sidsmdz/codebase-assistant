export class ConfigManager {
    private static instance: ConfigManager | null = null;
    private config: Map<string, any> = new Map();

    private constructor() {
        this.loadDefaults();
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private loadDefaults(): void {
        this.config.set('apiBaseUrl', '/api');
        this.config.set('wsUrl', 'ws://localhost:8080/ws');
        this.config.set('maxReconnectAttempts', 5);
        this.config.set('gridPageSize', 50);
        this.config.set('theme', 'light');
        this.config.set('notificationTimeout', 5000);
        this.config.set('debugMode', false);
    }

    get(key: string, defaultValue?: any): any {
        return this.config.has(key) ? this.config.get(key) : defaultValue;
    }

    set(key: string, value: any): void {
        this.config.set(key, value);
    }

    getAll(): Record<string, any> {
        const result: Record<string, any> = {};
        this.config.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    reset(): void {
        this.config.clear();
        this.loadDefaults();
    }
}
