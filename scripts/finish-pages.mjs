import { writeFile, copyFile } from 'node:fs/promises';
await writeFile(new URL('../docs/.nojekyll', import.meta.url), '');
await copyFile(new URL('../docs/index.html', import.meta.url), new URL('../docs/404.html', import.meta.url));
console.log('GitHub Pages build ready in docs/ (relative assets, no backend or API key).');
