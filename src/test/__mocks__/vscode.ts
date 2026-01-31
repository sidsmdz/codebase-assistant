// Minimal VS Code API mock for unit tests
export const workspace = {
    getConfiguration: () => ({
        get: (key: string, defaultValue: any) => defaultValue
    }),
    findFiles: async () => [],
    workspaceFolders: []
};

export const window = {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {}
    })
};

export const Uri = {
    file: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
    parse: (uri: string) => ({ fsPath: uri, path: uri, scheme: 'file' })
};

export const EventEmitter = class {
    fire() {}
    event() {}
    dispose() {}
};

export enum ViewColumn {
    One = 1,
    Two = 2
}
