import js from '@eslint/js'
import react from 'eslint-plugin-react'

export default [
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.{js,jsx}', '*.config.js'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        AbortController: 'readonly', AbortSignal: 'readonly', document: 'readonly',
        fetch: 'readonly', FormData: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', window: 'readonly',
      },
    },
    plugins: { react },
    rules: { ...js.configs.recommended.rules, 'react/jsx-uses-vars': 'error' },
  },
]
