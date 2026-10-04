import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so production builds need that base path.
// BASE_PATH is set by the deploy workflow; local dev keeps '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
