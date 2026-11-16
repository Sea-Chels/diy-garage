import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo-name>/. Set VITE_BASE in CI
// (the deploy workflow does this) or leave unset for local dev.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022', sourcemap: false },
});
