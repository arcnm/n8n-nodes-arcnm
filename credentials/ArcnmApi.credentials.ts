import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ArcnmApi implements ICredentialType {
	name = 'arcnmApi';

	displayName = 'ARCNM API';

	icon = {
		light: 'file:../nodes/Arcnm/arcnm.svg',
		dark: 'file:../nodes/Arcnm/arcnm.dark.svg',
	} as const;

	documentationUrl = 'https://arcnm.io/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Key from ARCNM, under Settings, then API keys. Sent as the X-API-Key header.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.arcnm.io',
			required: true,
			description: 'ARCNM API origin. Change this only when you were given a different origin.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/calculations/entitlement',
			method: 'GET',
		},
	};
}
