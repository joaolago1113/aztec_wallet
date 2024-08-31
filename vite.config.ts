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
        sourcemap: true,  // Enable source maps
        minify: false,  // Disable minification in development
    },
    base: '/',  // Ensure the base path is correct
    optimizeDeps: {
        include: ['@aztec/bb.js'],  // Explicitly include your dependencies
        esbuildOptions: {
            target: "esnext",
            sourcemap: true,  // Ensure source maps are generated for dependencies
            minify: false,  // Disable minification in development
        },
    },
    server: {
        watch: {
            ignored: ['**/node_modules/**', '**/.git/**'],  // Ignore unnecessary files
        },
    },
});