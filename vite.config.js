// Cesium runtime packaging follows projects/exoavdata/vite.config.js.
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
const require = createRequire(import.meta.url);
const cesium = path.dirname(require.resolve('cesium/package.json'));
export default defineConfig({
  base: './',
  define: { CESIUM_BASE_URL: JSON.stringify('./cesiumStatic') },
  plugins: [viteStaticCopy({ targets: [
    ...['Workers', 'ThirdParty', 'Assets', 'Widgets'].map(name => ({ src: path.join(cesium, 'Build/Cesium', name), dest: 'cesiumStatic' })),
    ...['LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json'].map(name => ({ src: path.join(cesium, name), dest: 'cesiumStatic/notices' }))
  ] })],
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
  server: { host: '127.0.0.1' }
});
