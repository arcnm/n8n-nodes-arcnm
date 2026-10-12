# n8n-nodes-arcnm

Quote machined and sheet-metal parts from CAD in [n8n](https://n8n.io/).

ARCNM turns a CAD file into an itemised manufacturing cost. This node calls the ARCNM REST API with your API key. Upload and Quote, and Quote, each use one calculation from your plan.

## Installation

In n8n, open Settings, then Community nodes, and install `n8n-nodes-arcnm`.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Calculation | Upload and Quote | Sends a CAD file and starts a quote. Uses one calculation. |
| Calculation | Quote | Starts a quote for a part revision you already have. Uses one calculation. |
| Calculation | Get | Reads one calculation. |
| Calculation | Get Many | Lists calculations. Return All walks every page. |
| Calculation | Get Cost Sheet | Reads the itemised cost sheet at a lot size you choose. |
| Calculation | Cancel | Stops a calculation that is still queued or running. |
| Part | Get | Reads one part. |
| Part | Get Many | Lists parts. The search box matches a substring. |
| Quota | Get | Reads how many calculations are left in this period. |

There is no wait step. After Upload and Quote or Quote, chain Get, or a Wait node, until the status is `succeeded`.

## Credentials

1. In ARCNM, open Settings, then API keys, then New key.
2. Copy the key when it is shown. ARCNM shows it once.
3. In n8n, create a credential named ARCNM API and paste the key there.
4. Leave the base URL as `https://api.arcnm.io` unless you were given a different origin.

Reads need the `parts:read` scope. Upload and Quote, Quote, and Cancel need `parts:write`. A key with both covers every operation in this node.

The node sends the key in the `X-API-Key` header.

## Usage

Put the CAD file in a binary property. The default property name is `data`. Set the part number, and set the file name when the binary item does not already include one, for example `bracket.step`.

Upload and Quote and Quote send an `Idempotency-Key`. Leave the field empty and a retry of that same n8n execution reuses the key. Set your own key when a later run must replay the same request. The same key and the same body replay a quote for 24 hours. A CAD upload over 1 MB keeps a short lock instead of that replay, so poll Get if the reply does not come back.

A finished calculation cannot be cancelled. The node returns the API error and stops, unless you turn on Continue On Fail.

## Compatibility

Tested on n8n 2.42.7.

## Resources

* [ARCNM docs](https://arcnm.io/docs)
* [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/installation/)

## Version history

### 0.1.0

First release. Quote from CAD, read calculations, cost sheets, parts, and the calculation allowance, and cancel a running calculation.
