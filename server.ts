import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { loadSharedConfigFiles } from '@aws-sdk/shared-ini-file-loader';
import { fromIni } from '@aws-sdk/credential-providers';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';

declare const Bun: any;

// Requires: bun add elysia @elysiajs/cors @elysiajs/static @aws-sdk/credential-providers @aws-sdk/signature-v4 @aws-sdk/shared-ini-file-loader @smithy/protocol-http @smithy/signature-v4 @aws-crypto/sha256-js

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
    // Avoids adding full SDK client by using SigV4 + Fetch against the API directly
    
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
    const { url, method, data, region, credentials, profile, headers: customHeaders } = body;

    if (!url) {
      set.status = 400;
      return "Missing url";
    }

    // Determine service name based on URL
    // OpenSearch Serverless: *.aoss.amazonaws.com -> 'aoss'
    // Managed OpenSearch: *.es.amazonaws.com -> 'es'
    const service = url.includes('aoss.amazonaws.com') ? 'aoss' : 'es';
    const awsRegion = region || 'us-east-1';

    let signerCredentials;

    try {
      if (profile) {
        // Option 1: Load from Profile via AWS SDK
        const provider = fromIni({ profile });
        signerCredentials = await provider();
      } else if (credentials && credentials.accessKey) {
        // Option 2: Manual Credentials
        signerCredentials = {
          accessKeyId: credentials.accessKey,
          secretAccessKey: credentials.secretKey,
          sessionToken: credentials.sessionToken
        };
      }
    } catch (e: any) {
       console.error("Credential Error:", e);
       set.status = 403;
       return { error: "Credential Error", details: e.message };
    }

    // If we have credentials, use AWS SDK SigV4
    if (signerCredentials) {
      try {
        const urlObj = new URL(url);
        
        const signer = new SignatureV4({
          credentials: signerCredentials,
          region: awsRegion,
          service: service,
          sha256: Sha256
        });

        const httpRequest = new HttpRequest({
          method: method || 'GET',
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'host': urlObj.host,
            'content-type': 'application/json',
            ...customHeaders
          },
          body: data ? JSON.stringify(data) : undefined
        });

        const signedRequest = await signer.sign(httpRequest);

        // Convert signed headers to plain object for fetch
        const fetchHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(signedRequest.headers)) {
          fetchHeaders[key] = value as string;
        }

        const response = await fetch(url, {
          method: signedRequest.method,
          headers: fetchHeaders,
          body: signedRequest.body
        });

        if (response.status === 403 || response.status === 401) {
          const text = await response.text();
          console.error("Auth Error from OpenSearch:", text);
          return { status: response.status, data: { error: "Authentication Failed", details: text } };
        }

        const responseData = await response.json().catch(async () => {
           const text = await response.text();
           return { text };
        });
        
        return {
          status: response.status,
          data: responseData
        };

      } catch (err: any) {
        console.error("Proxy Signing/Fetch error", err);
        set.status = 500;
        return { message: err.message };
      }
    } else {
      // No credentials - try basic fetch (likely to fail for AOSS but ok for public)
       try {
         const response = await fetch(url, {
           method: method || 'GET',
           headers: { 'Content-Type': 'application/json', ...customHeaders },
           body: data ? JSON.stringify(data) : undefined
         });
         const resData = await response.json().catch(() => ({}));
         return { status: response.status, data: resData };
       } catch (err: any) {
         set.status = 500;
         return err.message;
       }
    }
  })
  .get('*', () => {
    return Bun.file('dist/index.html');
  })
  .listen(3000);

console.log(`OpenSearch Navigator running at ${app.server?.hostname}:${app.server?.port}`);