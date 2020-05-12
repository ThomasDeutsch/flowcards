module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "off"
  },
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
};