import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import resolve from "vite-plugin-resolve";

const aztecVersion = "0.48.0";

export default defineConfig({
    plugins: [
        process.env.NODE_ENV === "production"
            ? /** @type {any} */ (
                resolve({
                    "@aztec/bb.js": `export * from "https://unpkg.com/@aztec/bb.js@${aztecVersion}/dest/browser/index.js"`,
                })
            )
            : undefined,
        nodePolyfills(),
    ].filter(Boolean),  // Filter out undefined plugins in development
    build: {
        target: "esnext",
        sourcemap: process.env.NODE_ENV === "production",  // Disable source maps in development
        minify: process.env.NODE_ENV === "production" ? 'esbuild' : false,  // Disable minification in development
        cacheDir: 'node_modules/.vite_cache',  // Cache directory for faster rebuilds
    },
    optimizeDeps: {
        include: ['@aztec/bb.js'],  // Explicitly include your dependencies
        esbuildOptions: {
            target: "esnext",
        },
    },
    server: {
        watch: {
            ignored: ['**/node_modules/**', '**/.git/**'],  // Ignore unnecessary files
        },
    },
});
