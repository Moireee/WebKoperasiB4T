import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project-site path. Keep this matching the repository name.
  base: '/WebKoperasiB4T/',
});
