/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
        '^.+\\.jsx?$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }]
    },
    transformIgnorePatterns: [
        'node_modules/(?!(java-parser|chevrotain|chevrotain-allstar|@chevrotain|lodash-es)/)'
    ],
    resolver: '<rootDir>/src/test/jest-resolver.js',
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts'
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/test/**', '!src/**/*.d.ts'],
    testTimeout: 30000
};
