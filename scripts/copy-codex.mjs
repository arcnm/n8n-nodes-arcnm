import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'nodes/Arcnm/Arcnm.node.json');
const to = join(root, 'dist/nodes/Arcnm/Arcnm.node.json');

// The Creator Portal indexes this file by the workflow type id. The starter
// template and the public Codex docs still write the package name alone, and
// a build that ships that value fails review. Fail here, before npm publish.
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const source = await readFile(join(root, 'nodes/Arcnm/Arcnm.node.ts'), 'utf8');
const declared = source.match(/name:\s*'([a-z][^']*)'/);
if (!declared) {
	console.error('Arcnm.node.ts does not declare a lowercase node name');
	process.exit(1);
}
const expected = `${pkg.name}.${declared[1]}`;
const codex = JSON.parse(await readFile(from, 'utf8'));
if (codex.node !== expected) {
	console.error(`codex node is ${JSON.stringify(codex.node)}; the registry id is ${expected}`);
	process.exit(1);
}

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
