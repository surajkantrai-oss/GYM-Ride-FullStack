import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['node_modules/**', 'dist/**', 'android/**', 'ios/**', '.expo/**'] }, ...tseslint.configs.recommended);
