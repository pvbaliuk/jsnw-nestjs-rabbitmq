const {createDefaultPreset} = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset({
    compiler: 'typescript',
    tsconfig: 'tsconfig.json'
}).transform;

/** @type {import('jest').Config} **/
module.exports = {
    testEnvironment: 'node',
    transform: {
        ...tsJestTransformCfg,
    }
};
