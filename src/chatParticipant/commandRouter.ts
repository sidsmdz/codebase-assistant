/**
 * Command aliases for faster interaction
 * Maps short commands to their full names
 */
export const COMMAND_ALIASES: Record<string, string> = {
    'g': 'generate',
    'e': 'explain',
    'a': 'analyze',
    'i': 'impact',
    't': 'trace',
    's': 'scan',
    'f': 'features'
};

/**
 * Resolves command aliases to full command names
 * @param command The command to resolve (may be an alias)
 * @returns The full command name
 */
export function resolveCommandAlias(command: string | undefined): string | undefined {
    if (!command) {
        return undefined;
    }
    return COMMAND_ALIASES[command] || command;
}
