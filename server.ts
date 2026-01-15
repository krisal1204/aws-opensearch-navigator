import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { loadSharedConfigFiles } from '@aws-sdk/shared-ini-file-loader';
import { fromIni } from '@aws-sdk/credential-providers';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

declare const Bun: any;

const app = new Elysia()
  .use(cors())
  .use(staticPlugin({
    assets: 'dist/assets',
    prefix: '/assets'
  }))
  .use(staticPlugin({
    assets: 'dist',
    prefix: '/'
  }))
  .get('/api/aws-profiles', async () => {
    try {
      const { configFile, credentialsFile } = await loadSharedConfigFiles();
      const profiles = new Set([
        ...Object.keys(configFile),
        ...Object.keys(credentialsFile)
      ]);
      return { profiles: Array.from(profiles) };
    } catch (error) {
      console.error("Error loading profiles:", error);
      return { profiles: [] };
    }
  })
  .post('/api/aws-discovery', async ({ body, set }: any) => {
    // Endpoint to list OpenSearch Serverless Collections for a region
    // keeping manual fetch for Control Plane operations as OpenSearch Client is for Data Plane
    
    const { region, credentials, profile } = body;
    const awsRegion = region || 'us-east-1';

    let signerCredentials;
    try {
      if (profile) {
        const provider = fromIni({ profile });
        signerCredentials = await provider();
      } else if (credentials && credentials.accessKey) {
        signerCredentials = {
          accessKeyId: credentials.accessKey,
          secretAccessKey: credentials.secretKey,
          sessionToken: credentials.sessionToken
        };
      }
    } catch (e: any) {
       set.status = 403;
       return { error: "Credential Error", details: e.message };
    }

    if (!signerCredentials) {
        set.status = 401;
        return { error: "No credentials provided" };
    }

    try {
        // OpenSearch Serverless ListCollections API
        const endpoint = `https://aoss.${awsRegion}.amazonaws.com/`;
        const urlObj = new URL(endpoint);

        const signer = new SignatureV4({
          credentials: signerCredentials,
          region: awsRegion,
          service: 'aoss',
          sha256: Sha256
        });

        // Construct request
        const httpRequest = new HttpRequest({
          method: 'POST',
          protocol: 'https:',
          hostname: urlObj.hostname,
          path: '/',
          headers: {
            'host': urlObj.host,
            'content-type': 'application/x-amz-json-1.0',
            'x-amz-target': 'OpenSearchServerless.ListCollections'
          },
          body: JSON.stringify({}) // Empty body lists all
        });

        const signedRequest = await signer.sign(httpRequest);
        
        // Convert headers
        const fetchHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(signedRequest.headers)) {
          fetchHeaders[key] = value as string;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: fetchHeaders,
          body: signedRequest.body
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`AWS API Error (${response.status}): ${text}`);
        }

        const data = await response.json();
        
        // Transform { collectionSummaries: [...] } to a simple list of objects with names
        const collections = (data.collectionSummaries || []).map((c: any) => {
             return {
                 name: c.name,
                 id: c.id,
                 endpoint: `https://${c.id}.${awsRegion}.aoss.amazonaws.com`
             };
        });

        return { collections };

    } catch (err: any) {
        console.error("Discovery Error:", err);
        set.status = 500;
        return { error: err.message };
    }
  })
  .post('/api/proxy', async ({ body, set }: any) => {
    // Expects body: { url, method, data, region, credentials: { ... }, profile: "default" }
    const { url, method, data, region, credentials, profile } = body;

    if (!url) {
      set.status = 400;
      return "Missing url";
    }

    const awsRegion = region || 'us-east-1';
    // Determine service name based on URL
    const service = url.includes('aoss.amazonaws.com') ? 'aoss' : 'es';

    // Helper to retrieve credentials compatible with OpenSearch Client
    const getCredentials = async () => {
        if (profile) {
            const provider = fromIni({ profile });
            const creds = await provider();
            return {
                accessKeyId: creds.accessKeyId,
                secretAccessKey: creds.secretAccessKey,
                sessionToken: creds.sessionToken
            };
        } else if (credentials && credentials.accessKey) {
            return {
                accessKeyId: credentials.accessKey,
                secretAccessKey: credentials.secretKey,
                sessionToken: credentials.sessionToken
            };
        }
        throw new Error("No credentials provided");
    };

    try {
        // Parse the full URL to separate the Node URL from the path
        // e.g. input: https://xyz.us-east-1.aoss.amazonaws.com/my-index/_search
        // node: https://xyz.us-east-1.aoss.amazonaws.com
        // path: /my-index/_search
        const urlObj = new URL(url);
        const node = `${urlObj.protocol}//${urlObj.host}`;
        const path = urlObj.pathname + urlObj.search;

        // Initialize OpenSearch Client with AWS Sigv4 Signer
        const client = new Client({
            ...AwsSigv4Signer({
                region: awsRegion,
                service: service,
                getCredentials
            }),
            node: node
        });

        // Use the transport to make a raw request (acting as a proxy)
        const response = await client.transport.request({
            method: method || 'GET',
            path: path,
            body: data
        });

        return {
            status: response.statusCode,
            data: response.body
        };

    } catch (err: any) {
        console.error("OpenSearch Proxy Error:", err.message);
        
        // Handle OpenSearch Client specific error structure
        const statusCode = err.statusCode || 500;
        set.status = statusCode;

        return {
            status: statusCode,
            data: {
                error: err.name || "OpenSearch Error",
                message: err.message,
                // Pass through underlying error details if available
                details: err.body ? JSON.stringify(err.body) : undefined
            }
        };
    }
  })
  .get('*', () => {
    return Bun.file('dist/index.html');
  })
  .listen(3000);

console.log(`OpenSearch Navigator running at ${app.server?.hostname}:${app.server?.port}`);