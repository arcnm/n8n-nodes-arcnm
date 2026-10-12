import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	CALCULATION_PAGE_SIZE,
	MAX_PAGES,
	PART_PAGE_SIZE,
	buildEndpoint,
	normalizeBaseUrl,
	readApiFailure,
	readList,
} from './api';

export interface ArcnmRequest {
	method: 'GET' | 'POST';
	path: string;
	query?: Record<string, string | string[] | undefined>;
	body?: Record<string, unknown>;
	idempotencyKey?: string;
	timeout?: number;
}

function asObject(value: unknown): IDataObject | undefined {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}
	return undefined;
}

export async function arcnmRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	spec: ArcnmRequest,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('arcnmApi');
	let baseUrl: string;
	try {
		baseUrl = normalizeBaseUrl(String(credentials.baseUrl ?? ''));
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
	}

	const headers: IDataObject = { Accept: 'application/json' };
	if (spec.idempotencyKey) headers['Idempotency-Key'] = spec.idempotencyKey;

	const options: IHttpRequestOptions = {
		method: spec.method,
		url: buildEndpoint(baseUrl, spec.path, spec.query),
		headers,
		json: true,
	};
	if (spec.body !== undefined) options.body = spec.body;
	if (spec.timeout !== undefined) options.timeout = spec.timeout;

	try {
		const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'arcnmApi',
			options,
		);
		const object = asObject(response);
		if (object === undefined) {
			throw new NodeOperationError(this.getNode(), 'ARCNM returned a response that is not an object.', {
				itemIndex,
			});
		}
		return object;
	} catch (error) {
		if (error instanceof NodeOperationError) {
			throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
		}
		const failure = readApiFailure(error);
		const details: JsonObject = { message: failure.message };
		if (failure.code !== undefined) details.code = failure.code;
		if (failure.requestId !== undefined) details.requestId = failure.requestId;
		throw new NodeApiError(this.getNode(), details, {
			itemIndex,
			message: failure.message,
			description: failure.requestId ? `Request ID: ${failure.requestId}` : undefined,
			httpCode: failure.httpStatus !== undefined ? String(failure.httpStatus) : undefined,
		});
	}
}

export async function arcnmList(
	this: IExecuteFunctions,
	itemIndex: number,
	spec: {
		path: string;
		listKey: 'items' | 'data';
		query: Record<string, string | string[] | undefined>;
		limit: number;
	},
): Promise<IDataObject[]> {
	const pageSize = spec.listKey === 'items' ? CALCULATION_PAGE_SIZE : PART_PAGE_SIZE;
	const rows: IDataObject[] = [];
	const seen = new Set<string>();
	let cursor: string | undefined;

	while (rows.length < spec.limit) {
		const pageLimit = Math.min(pageSize, spec.limit - rows.length);
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'GET',
			path: spec.path,
			query: { ...spec.query, limit: String(pageLimit), cursor },
		});
		const page = readList(body, spec.listKey);
		for (const row of page.rows) {
			const object = asObject(row);
			if (object !== undefined) rows.push(object);
			if (rows.length >= spec.limit) break;
		}
		if (!page.hasMore || page.nextCursor === undefined) break;
		if (seen.has(page.nextCursor)) {
			throw new NodeOperationError(this.getNode(), 'ARCNM repeated a page cursor, so the list stopped.', {
				itemIndex,
			});
		}
		seen.add(page.nextCursor);
		if (seen.size >= MAX_PAGES) {
			throw new NodeOperationError(
				this.getNode(),
				`Stopped after ${MAX_PAGES} pages. Narrow the filters, or set a limit.`,
				{ itemIndex },
			);
		}
		cursor = page.nextCursor;
	}

	return rows;
}

export function outputItem(json: IDataObject, itemIndex: number): INodeExecutionData {
	return { json, pairedItem: { item: itemIndex } };
}
