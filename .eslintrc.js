module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-explicit-any": "off",
    //"@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-use-before-define": "off"
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