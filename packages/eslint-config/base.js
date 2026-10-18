import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Rules mirror docs/typescript.md: trust types, validate at boundaries.
export default tseslint.config(
  { ignores: ['dist', '.next', 'node_modules', 'coverage', '.turbo', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-nested-ternary': 'error',
    },
  },
);
