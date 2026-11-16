/**
 * ESLint del Nest (plans/plan-buenas-practicas-v0, 3.3). Solo lo que alguna regla pide: el estilo lo hace prettier
 * (`npm run format`), no el lint. Corre en `npm run gate` y en el Dockerfile.
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  // `prettier` (eslint-config-prettier) apaga las reglas de formato que pelearían con prettier.
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  // Los moldes del generador tienen marcadores y no son código vivo (los prueba code-generator.spec.ts).
  ignorePatterns: ['.eslintrc.js', 'dist/**', 'node_modules/**', 'src/code-generator/template/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    // Logs en JSON por el logger del Nest (3.11): nada de console suelto. Excepciones abajo (CLI y scripts).
    'no-console': 'error',
    // Una sola puerta para el email (regla nest-email-module.mdc): nodemailer, handlebars y @nestjs-modules/mailer
    // solo dentro de src/commons/email (override de abajo). Lo controla también src/commons/email/email.boundary.spec.ts.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'nodemailer', message: 'Todo mail del Nest sale por EmailService (src/commons/email).' },
          { name: 'handlebars', message: 'Las plantillas de email viven en src/commons/email.' },
          { name: '@nestjs-modules/mailer', message: 'Todo mail del Nest sale por EmailService (src/commons/email).' },
        ],
        patterns: ['nodemailer/*', 'handlebars/*', '@nestjs-modules/mailer/*'],
      },
    ],
  },
  overrides: [
    {
      files: ['src/commons/email/**/*.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      // CLI y scripts: escriben en la consola a propósito.
      files: ['src/commons/email/email.cli.ts', 'scripts/**/*.ts', 'src/code-generator/**', '**/*.spec.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
}
