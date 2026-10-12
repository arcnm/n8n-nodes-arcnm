import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { assertUploadSize, knownMime, omitEmpty, positiveInt, resolveIdempotencyKey, text } from './api';
import { arcnmList, arcnmRequest, outputItem } from './GenericFunctions';
import { nodeProperties } from './properties';

// Programmatic style: upload reads a binary file and base64-encodes it,
// list operations walk a cursor, and writes send an idempotency key.
export class Arcnm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ARCNM',
		name: 'arcnm',
		icon: { light: 'file:arcnm.svg', dark: 'file:arcnm.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Quote machined and sheet-metal parts from CAD',
		defaults: { name: 'ARCNM' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'arcnmApi', required: true }],
		properties: nodeProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const produced = await runItem.call(this, itemIndex);
				returnData.push(...produced);
			} catch (error) {
				if (this.continueOnFail()) {
					const message = error instanceof Error ? error.message : 'Request failed';
					returnData.push({ json: { message }, pairedItem: { item: itemIndex } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(
						this.getNode(),
						{ message: error.message },
						{
							itemIndex,
							message: error.message,
							httpCode: error.httpCode ?? undefined,
						},
					);
				}
				const message = error instanceof Error ? error.message : 'Request failed';
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}

		return [returnData];
	}
}

async function runItem(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
	const resource = this.getNodeParameter('resource', itemIndex) as string;
	const operation = this.getNodeParameter('operation', itemIndex) as string;

	if (resource === '__CUSTOM_API_CALL__' || operation === '__CUSTOM_API_CALL__') {
		throw new NodeOperationError(
			this.getNode(),
			'Custom API Call is not available on this node. Pick an operation from the list.',
			{ itemIndex },
		);
	}

	if (resource === 'quota' && operation === 'get') {
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'GET',
			path: '/api/v1/calculations/entitlement',
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'part' && operation === 'get') {
		const partId = required.call(this, this.getNodeParameter('partId', itemIndex) as string, 'Part ID', itemIndex);
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'GET',
			path: `/api/v1/parts/${encodeURIComponent(partId)}`,
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'part' && operation === 'getAll') {
		const filters = this.getNodeParameter('partFilters', itemIndex, {}) as IDataObject;
		const rows = await arcnmList.call(this, itemIndex, {
			path: '/api/v1/parts/',
			listKey: 'data',
			limit: itemLimit.call(this, itemIndex),
			query: {
				q: text(filters.q),
				folder_id: text(filters.folderId),
			},
		});
		return rows.map((row) => outputItem(row, itemIndex));
	}

	if (resource === 'calculation' && operation === 'getAll') {
		const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
		const status = Array.isArray(filters.status) ? filters.status.map(String).filter((value) => value !== '') : [];
		const rows = await arcnmList.call(this, itemIndex, {
			path: '/api/v1/calculations',
			listKey: 'items',
			limit: itemLimit.call(this, itemIndex),
			query: {
				status_filter: status.length > 0 ? status : undefined,
				part_id: text(filters.partId),
				batch_id: text(filters.batchId),
				created_after: text(filters.createdAfter),
				created_before: text(filters.createdBefore),
			},
		});
		return rows.map((row) => outputItem(row, itemIndex));
	}

	if (resource === 'calculation' && operation === 'get') {
		const calculationId = required.call(
			this,
			this.getNodeParameter('calculationId', itemIndex) as string,
			'Calculation ID',
			itemIndex,
		);
		const includeAnalytics = this.getNodeParameter('includeAnalytics', itemIndex) as boolean;
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'GET',
			path: `/api/v1/calculations/${encodeURIComponent(calculationId)}`,
			query: { include_analytics: includeAnalytics ? 'true' : 'false' },
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'calculation' && operation === 'getCostSheet') {
		const calculationId = required.call(
			this,
			this.getNodeParameter('calculationId', itemIndex) as string,
			'Calculation ID',
			itemIndex,
		);
		const quantity = sheetQuantity(this.getNodeParameter('quantity', itemIndex, 0));
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'GET',
			path: `/api/v1/calculations/${encodeURIComponent(calculationId)}/cost-sheet`,
			query: { quantity: quantity === undefined ? undefined : String(quantity) },
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'calculation' && operation === 'cancel') {
		const calculationId = required.call(
			this,
			this.getNodeParameter('calculationId', itemIndex) as string,
			'Calculation ID',
			itemIndex,
		);
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'POST',
			path: `/api/v1/calculations/${encodeURIComponent(calculationId)}/cancel`,
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'calculation' && operation === 'quote') {
		const partRevisionId = required.call(
			this,
			this.getNodeParameter('partRevisionId', itemIndex) as string,
			'Part revision ID',
			itemIndex,
		);
		const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'POST',
			path: '/api/v1/calculations/quote',
			idempotencyKey: idempotency.call(this, itemIndex, operation),
			body: {
				part_revision_id: partRevisionId,
				...omitEmpty({
					lot_size: positiveInt(additional.lotSize, 'Lot size'),
					costing_environment_id: text(additional.costingEnvironmentId),
				}),
			},
		});
		return [outputItem(body, itemIndex)];
	}

	if (resource === 'calculation' && operation === 'uploadAndQuote') {
		const uploaded = await uploadBody.call(this, itemIndex);
		const body = await arcnmRequest.call(this, itemIndex, {
			method: 'POST',
			path: '/api/v1/calculations/upload-and-quote-json',
			idempotencyKey: idempotency.call(this, itemIndex, operation),
			timeout: 300_000,
			body: uploaded,
		});
		return [outputItem(body, itemIndex)];
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation ${resource} ${operation}.`, {
		itemIndex,
	});
}

function itemLimit(this: IExecuteFunctions, itemIndex: number): number {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	if (returnAll) return Number.MAX_SAFE_INTEGER;
	const limit = positiveInt(this.getNodeParameter('limit', itemIndex, 50), 'Limit');
	return limit ?? 50;
}

function idempotency(this: IExecuteFunctions, itemIndex: number, operation: string): string | undefined {
	const provided = this.getNodeParameter('idempotencyKey', itemIndex, '') as string;
	return resolveIdempotencyKey(provided, this.getExecutionId(), itemIndex, operation);
}

function sheetQuantity(value: unknown): number | undefined {
	if (value === 0 || value === '0' || value === '' || value === undefined || value === null) return undefined;
	return positiveInt(value, 'Quantity');
}

function required(this: IExecuteFunctions, value: string, label: string, itemIndex: number): string {
	const trimmed = value.trim();
	if (trimmed === '') {
		throw new NodeOperationError(this.getNode(), `${label} is required.`, { itemIndex });
	}
	return trimmed;
}

async function uploadBody(this: IExecuteFunctions, itemIndex: number): Promise<Record<string, unknown>> {
	const partNumber = required.call(
		this,
		this.getNodeParameter('partNumber', itemIndex) as string,
		'Part number',
		itemIndex,
	);
	const binaryPropertyName = required.call(
		this,
		this.getNodeParameter('binaryPropertyName', itemIndex) as string,
		'CAD binary property',
		itemIndex,
	);
	const cad = await readNamedBinary.call(this, itemIndex, binaryPropertyName, 'cadFileName', 'CAD file name');

	const drawingProperty = text(this.getNodeParameter('drawingBinaryPropertyName', itemIndex, '') as string);
	const drawing = drawingProperty
		? await readNamedBinary.call(this, itemIndex, drawingProperty, 'drawingFileName', 'Drawing file name')
		: undefined;
	assertUploadSize(cad.bytes, drawing?.bytes ?? 0);

	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	return {
		part_number: partNumber,
		cad_file_b64: cad.base64,
		cad_filename: cad.fileName,
		...omitEmpty({
			cad_content_type: knownMime(cad.mimeType),
			drawing_file_b64: drawing?.base64,
			drawing_filename: drawing?.fileName,
			drawing_content_type: knownMime(drawing?.mimeType),
			lot_size: positiveInt(additional.lotSize, 'Lot size'),
			costing_environment_id: text(additional.costingEnvironmentId),
			currency: text(additional.currency),
			folder_id: text(additional.folderId),
			on_conflict: text(additional.onConflict),
		}),
	};
}

async function readNamedBinary(
	this: IExecuteFunctions,
	itemIndex: number,
	propertyName: string,
	nameParameter: string,
	label: string,
): Promise<{ base64: string; fileName: string; mimeType?: string; bytes: number }> {
	const binary = this.helpers.assertBinaryData(itemIndex, propertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, propertyName);
	const override = text(this.getNodeParameter(nameParameter, itemIndex, '') as string);
	const fileName = override ?? binary.fileName?.trim();
	if (!fileName) {
		throw new NodeOperationError(this.getNode(), `Add a ${label} with an extension, such as bracket.step.`, {
			itemIndex,
		});
	}
	return {
		base64: buffer.toString('base64'),
		fileName,
		mimeType: binary.mimeType,
		bytes: buffer.length,
	};
}
