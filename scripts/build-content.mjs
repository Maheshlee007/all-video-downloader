import { build } from 'esbuild';
await build({
  entryPoints: ['src/extension/content.ts'],
  outfile: 'dist/content.js',
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: true,
});
import { globSync, readFileSync, statSync, writeFileSync } from 'node:fs';
const notices = [...globSync(['node_modules/**/LICENSE*', 'node_modules/**/NOTICE*'])]
  .filter((path) => statSync(path).isFile())
  .sort()
  .map((path) => `\n${'='.repeat(72)}\n${path}\n${'='.repeat(72)}\n${readFileSync(path, 'utf8')}`);
writeFileSync('dist/THIRD-PARTY-LICENSES.txt', notices.join('\n'));
