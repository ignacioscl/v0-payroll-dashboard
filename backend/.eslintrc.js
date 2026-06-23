module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:import/errors',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    'prettier/prettier': 'error',
    'import/order': [
      'error',
      {
        groups: [['builtin', 'external'], 'internal', ['sibling', 'parent', 'index']],
        'newlines-between': 'always',
      },
    ],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'import/extensions': 0,
    'no-param-reassign': [
      'error',
      {
        props: true,
      },
    ],
    'no-return-await': 'error',
    'no-unneeded-ternary': 'error',
    'no-console': 'error',
    'import/prefer-default-export': 0,
    '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        multiline: {
          delimiter: 'none',
        },
        singleline: {
          delimiter: 'semi',
        },
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 0,
    '@typescript-eslint/explicit-module-boundary-types': 0,
    'no-restricted-imports': [
      'error',
      {
        paths: ['src', 'build'],
        patterns: ['src/*', 'build/*'],
      },
    ],
  },
}
