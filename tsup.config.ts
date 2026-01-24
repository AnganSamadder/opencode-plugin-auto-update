import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: {
    entry: ['src/index.ts']
  },
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  shims: true
});
