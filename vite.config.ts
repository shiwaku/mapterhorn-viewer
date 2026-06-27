import { defineConfig } from 'vite';

// Base path is relative so the build can be hosted from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  server: {
    host: true, // expose on the LAN / reachable from the Windows host when running under WSL
    watch: {
      // The project lives on a Windows drive (/mnt/c) under WSL2, where inotify
      // events don't fire. Poll the filesystem so edits trigger HMR / reloads.
      usePolling: true,
      interval: 300,
    },
  },
});
