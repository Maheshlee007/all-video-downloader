import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
mkdirSync('artifacts', { recursive: true });
execFileSync('zip', ['-qr', '../artifacts/clipnest-0.1.0.zip', '.'], {
  cwd: 'dist',
  stdio: 'inherit',
});
console.log('Packaged artifacts/clipnest-0.1.0.zip');
