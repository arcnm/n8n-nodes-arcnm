import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	MAX_UPLOAD_BYTES,
	assertUploadSize,
	buildEndpoint,
	knownMime,
	normalizeBaseUrl,
	omitEmpty,
	positiveInt,
	readApiFailure,
	readList,
	resolveIdempotencyKey,
	text,
} from '../dist/nodes/Arcnm/api.js';

test('codex node id is the package name plus the declared node name', () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const codex = JSON.parse(readFileSync(join(root, 'nodes/Arcnm/Arcnm.node.json'), 'utf8'));
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const source = readFileSync(join(root, 'nodes/Arcnm/Arcnm.node.ts'), 'utf8');
	const declared = source.match(/name:\s*'([a-z][^']*)'/);
	assert.ok(declared, 'node description must declare a lowercase name');
	assert.equal(codex.node, `${pkg.name}.${declared[1]}`);
	assert.equal(codex.nodeVersion, '1.0');
	assert.equal(codex.codexVersion, '1.0');
	assert.deepEqual(codex.categories, ['Productivity']);
	const distPath = join(root, 'dist/nodes/Arcnm/Arcnm.node.json');
	if (existsSync(distPath)) {
		assert.equal(JSON.parse(readFileSync(distPath, 'utf8')).node, codex.node);
	}
});

test('base URL keeps only the origin', () => {
	assert.equal(normalizeBaseUrl('https://api.arcnm.io/'), 'https://api.arcnm.io');
	assert.equal(normalizeBaseUrl(' https://api.arcnm.io/ignored '), 'https://api.arcnm.io');
	assert.throws(() => normalizeBaseUrl('ftp://api.arcnm.io'), /http/);
	const withUserinfo = ['https://user:secret', 'api.arcnm.io'].join('@');
	assert.throws(() => normalizeBaseUrl(withUserinfo), /API key/);
});

test('query string repeats status and skips empty values', () => {
	const url = new URL(
		buildEndpoint('https://api.arcnm.io', '/api/v1/calculations', {
			status_filter: ['queued', 'running'],
			part_id: undefined,
			cursor: '',
			limit: '2',
		}),
	);
	assert.equal(url.origin, 'https://api.arcnm.io');
	assert.equal(url.pathname, '/api/v1/calculations');
	assert.deepEqual(url.searchParams.getAll('status_filter'), ['queued', 'running']);
	assert.equal(url.searchParams.get('limit'), '2');
	assert.equal(url.searchParams.has('part_id'), false);
	assert.equal(url.searchParams.has('cursor'), false);
});

test('list readers use the documented envelope', () => {
	assert.deepEqual(readList({ items: [{ id: 'calc-1' }], has_more: true, next_cursor: 'next' }, 'items'), {
		rows: [{ id: 'calc-1' }],
		nextCursor: 'next',
		hasMore: true,
	});
	assert.deepEqual(readList({ data: [], has_more: false, next_cursor: null }, 'data'), {
		rows: [],
		nextCursor: undefined,
		hasMore: false,
	});
	assert.equal(readList({ items: [], has_more: true }, 'items').hasMore, false);
	assert.throws(() => readList({ data: [] }, 'items'), /items/);
});

test('API errors prefer the envelope and drop the raw payload', () => {
	const failure = readApiFailure({
		statusCode: 404,
		message: 'raw transport message',
		error: {
			error: { code: 'not_found', message: 'Calculation was not found' },
			request_id: 'req_example',
		},
	});
	assert.equal(failure.message, 'not_found: Calculation was not found');
	assert.equal(failure.code, 'not_found');
	assert.equal(failure.requestId, 'req_example');
	assert.equal(failure.httpStatus, 404);
	assert.equal(readApiFailure({ message: 'network down' }).message, 'network down');
});

test('idempotency key prefers an explicit value and otherwise uses the execution', () => {
	assert.equal(resolveIdempotencyKey(' my-key ', 'exec-1', 0, 'quote'), 'my-key');
	assert.equal(resolveIdempotencyKey('', 'exec-1', 2, 'quote'), 'n8n:exec-1:2:quote');
	assert.equal(resolveIdempotencyKey('  ', undefined, 0, 'quote'), undefined);
});

test('upload guard and small field helpers', () => {
	assert.doesNotThrow(() => assertUploadSize(MAX_UPLOAD_BYTES, 0));
	assert.throws(() => assertUploadSize(MAX_UPLOAD_BYTES, 1), /47 MB/);
	assert.equal(knownMime('model/step; charset=binary'), 'model/step');
	assert.equal(knownMime('application/octet-stream'), undefined);
	assert.equal(positiveInt('', 'Lot size'), undefined);
	assert.equal(positiveInt(2, 'Lot size'), 2);
	assert.throws(() => positiveInt(1.5, 'Lot size'), /whole number/);
	assert.deepEqual(omitEmpty({ lot_size: 2, currency: '', folder_id: undefined }), { lot_size: 2 });
	assert.equal(text('  '), undefined);
	assert.equal(text(' EUR '), 'EUR');
});
