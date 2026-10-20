import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// wrangler 把 .txt / .sql 当作文本打包，测试时用同样的方式加载
export default defineConfig({
  plugins: [{
    name: 'text-modules',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.txt') || id.endsWith('.sql')) {
        return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
      }
      return null;
    },
  }],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
