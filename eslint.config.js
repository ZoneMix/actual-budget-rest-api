import securityPlugin from 'eslint-plugin-security';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'data/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      },
    },
    plugins: {
      security: securityPlugin,
    },
    rules: {
      // Error rules
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-use-before-define': 'error',
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',

      // Security plugin rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-no-csrf-before-method-override': 'warn',

      // Warnings for code quality
      'no-warning-comments': ['warn', { terms: ['TODO', 'FIXME', 'XXX', 'HACK'] }],
      'no-unused-expressions': 'warn',
      'no-shadow': ['warn', { builtinGlobals: false }],
      'no-else-return': 'warn',
      'no-empty-function': 'warn',

      // Best practices
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-invalid-regexp': 'error',
      'no-regex-spaces': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
      'array-callback-return': 'error',
      'no-prototype-builtins': 'warn',
      'no-redeclare': 'error',
      'no-return-await': 'warn',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
    },
  },
];
