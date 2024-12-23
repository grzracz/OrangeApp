import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        tsconfigPaths(),
        nodePolyfills({
            exclude: [],
            protocolImports: true,
        }),
    ],
    root: './',
    build: {
        outDir: 'dist',
    },
    publicDir: 'src/public',
    server: {
        host: true, // or '0.0.0.0'
        port: 5173,
    },
});
