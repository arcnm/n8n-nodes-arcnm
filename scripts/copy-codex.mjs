import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'nodes/Arcnm/Arcnm.node.json');
const to = join(root, 'dist/nodes/Arcnm/Arcnm.node.json');
await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
