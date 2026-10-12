/** Pure request helpers. No I/O, so the unit tests can run without n8n. */

export const CALCULATION_PAGE_SIZE = 100;
export const PART_PAGE_SIZE = 100;
export const MAX_PAGES = 200;
/** Combined raw CAD and drawing size this node will encode. */
export const MAX_UPLOAD_BYTES = 47 * 1024 * 1024;

function parseUrl(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}

export function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, '');
	const url = parseUrl(trimmed);
	if (url === undefined || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
		throw new Error('Base URL must start with http:// or https://.');
	}
	const authority = trimmed.slice(trimmed.indexOf('://') + 3).split('/')[0] ?? '';
	if (authority.includes('@')) {
		throw new Error('Put the API key in the API Key field, not in the base URL.');
	}
	return url.origin;
}

export function buildEndpoint(
	baseUrl: string,
	path: string,
	query: Record<string, string | string[] | undefined> = {},
): string {
	const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined) continue;
		const values = Array.isArray(value) ? value : [value];
		for (const item of values) {
			if (item === '') continue;
			url.searchParams.append(key, item);
		}
	}
	return url.toString();
}

export function text(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

export function positiveInt(value: unknown, label: string): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${label} needs a whole number of 1 or greater.`);
	}
	return parsed;
}

export function omitEmpty(fields: Record<string, unknown>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') continue;
		body[key] = value;
	}
	return body;
}

export function knownMime(mime: string | undefined): string | undefined {
	if (!mime) return undefined;
	const value = mime.split(';')[0]?.trim().toLowerCase() ?? '';
	if (value === '' || value === 'application/octet-stream') return undefined;
	return value;
}

export function assertUploadSize(cadBytes: number, drawingBytes = 0): void {
	const total = cadBytes + drawingBytes;
	if (total > MAX_UPLOAD_BYTES) {
		throw new Error(
			'These files are too large to upload together. Keep the CAD file and the drawing under 47 MB combined.',
		);
	}
}

export function resolveIdempotencyKey(
	provided: string,
	executionId: string | undefined,
	itemIndex: number,
	operation: string,
): string | undefined {
	const trimmed = provided.trim();
	if (trimmed !== '') return trimmed;
	if (!executionId) return undefined;
	return `n8n:${executionId}:${itemIndex}:${operation}`;
}

export interface ArcnmListPage {
	rows: unknown[];
	nextCursor?: string;
	hasMore: boolean;
}

export function readList(body: Record<string, unknown>, key: 'items' | 'data'): ArcnmListPage {
	const rows = body[key];
	if (!Array.isArray(rows)) {
		throw new Error(`ARCNM returned a list without ${key}.`);
	}
	const nextCursor = typeof body.next_cursor === 'string' && body.next_cursor !== '' ? body.next_cursor : undefined;
	return {
		rows,
		nextCursor,
		hasMore: body.has_more === true && nextCursor !== undefined,
	};
}

export interface ArcnmApiFailure {
	message: string;
	code?: string;
	requestId?: string;
	httpStatus?: number;
}

export function readApiFailure(error: unknown): ArcnmApiFailure {
	const err = (error ?? {}) as Record<string, unknown>;
	const httpStatus = typeof err.statusCode === 'number' ? err.statusCode : undefined;
	const rawBody = err.error !== undefined && typeof err.error === 'object' ? err.error : err;
	const body = (rawBody ?? {}) as Record<string, unknown>;
	const envelope =
		body.error !== undefined && typeof body.error === 'object'
			? (body.error as Record<string, unknown>)
			: {};
	const code = typeof envelope.code === 'string' ? envelope.code : undefined;
	const apiMessage = typeof envelope.message === 'string' ? envelope.message : undefined;
	const requestId = typeof body.request_id === 'string' ? body.request_id : undefined;
	const fallback = typeof err.message === 'string' && err.message !== '' ? err.message : 'ARCNM request failed';
	const message = code && apiMessage ? `${code}: ${apiMessage}` : (apiMessage ?? fallback);
	return { message, code, requestId, httpStatus };
}
