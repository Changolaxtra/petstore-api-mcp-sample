/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testRegex: 'test/.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['\\.e2e-spec\\.ts$'],
  moduleFileExtensions: ['js', 'json', 'ts'],
};
