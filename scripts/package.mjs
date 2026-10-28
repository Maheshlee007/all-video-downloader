import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
mkdirSync('artifacts', { recursive: true });
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const filename = `clipnest-${version}.zip`;
rmSync(`artifacts/${filename}`, { force: true });
execFileSync('zip', ['-qr', `../artifacts/${filename}`, '.'], {
  cwd: 'dist',
  stdio: 'inherit',
});
console.log(`Packaged artifacts/${filename}`);
