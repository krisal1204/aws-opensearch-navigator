import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { AwsClient } from 'aws4fetch';
import { homedir } from 'os';
import { join } from 'path';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';

declare const Bun: any;

// Requires: bun add elysia @elysiajs/cors @elysiajs/static aws4fetch

// Helper to parse INI files (simple version for AWS creds)
const parseIni = (content: string) => {
  const result: Record<string, any> = {};
  let currentSection = '';
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) return;
    
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      result[currentSection] = {};
    } else if (currentSection) {
      const [key, ...valParts] = line.split('=');
      if (key && valParts.length) {
        result[currentSection][key.trim()] = valParts.join('=').trim();
      }
    }
  });
  return result;
};

const getAwsCredentialsFile = async () => {
  const home = homedir();
  const paths = [
    join(home, '.aws', 'credentials'),
    join(home, '.aws', 'config') // Sometimes creds are here for SSO
  ];

  for (const p of paths) {
    try {
      await access(p, constants.R_OK);
      const content = await readFile(p, 'utf-8');
      return { path: p, content };
    } catch {
      continue;
    }
  }
  return null;
};

const app = new Elysia()
  .use(cors())
  // Serve specific assets folder
  .use(staticPlugin({
    assets: 'dist/assets',
    prefix: '/assets'
  }))
  // Serve root files (index.html, favicon, etc)
  .use(staticPlugin({
    assets: 'dist',
    prefix: '/'
  }))
  .get('/api/aws-profiles', async () => {
    const fileData = await getAwsCredentialsFile();
    if (!fileData) return { profiles: [] };
    
    const parsed = parseIni(fileData.content);
    // Filter out sections that don't look like profiles or process 'profile name' syntax from config
    const profiles = Object.keys(parsed).map(k => k.replace(/^profile\s+/, ''));
    return { profiles: [...new Set(profiles)] }; // Dedupe
  })
  .get('/api/aws-creds/:profile', async ({ params, set }) => {
    const profileName = params.profile;
    const fileData = await getAwsCredentialsFile();
    
    if (!fileData) {
        set.status = 404;
        return 'Credentials file not found';
    }
    
    const parsed = parseIni(fileData.content);
    
    // Check for exact match or 'profile name' match (common in ~/.aws/config)
    let section = parsed[profileName] || parsed[`profile ${profileName}`];
    
    if (!section) {
       set.status = 404;
       return 'Profile not found';
    }

    return {
      accessKeyId: section.aws_access_key_id,
      secretAccessKey: section.aws_secret_access_key,
      sessionToken: section.aws_session_token,
      region: section.region
    };
  })
  .post('/api/proxy', async ({ body, set }: any) => {
    // Expects body: { url, method, data, region, credentials: { ... } }
    const { url, method, data, region, credentials, headers: customHeaders } = body;

    if (!url) {
      set.status = 400;
      return "Missing url";
    }

    // If using demo mode or no credentials provided, basic proxy might fail against AWS 
    // unless it's a public endpoint. 
    if (!credentials || !credentials.accessKey) {
       // Fallback for non-signed requests if needed, or error out
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

    // Determine service name based on URL
    // OpenSearch Serverless: *.aoss.amazonaws.com -> 'aoss'
    // Managed OpenSearch: *.es.amazonaws.com -> 'es'
    const service = url.includes('aoss.amazonaws.com') ? 'aoss' : 'es';

    const client = new AwsClient({
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
      sessionToken: credentials.sessionToken,
      region: region || 'us-east-1',
      service: service,
    });

    try {
      const response = await client.fetch(url, {
        method: method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...customHeaders
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      // Handle 403/401 specifically to give better errors
      if (response.status === 403 || response.status === 401) {
        const text = await response.text();
        console.error("Auth Error:", text);
        return { status: response.status, data: { error: "Authentication Failed", details: text } };
      }

      const responseData = await response.json().catch(async () => {
         // Fallback for text responses (like _cat/indices)
         const text = await response.text();
         return { text };
      });
      
      return {
        status: response.status,
        data: responseData
      };
    } catch (err: any) {
      console.error("Proxy error", err);
      set.status = 500;
      return { message: err.message };
    }
  })
  // Fallback for SPA routing: serve index.html for any unknown non-API routes
  .get('*', () => {
    return Bun.file('dist/index.html');
  })
  .listen(3000);

console.log(`OpenSearch Navigator running at ${app.server?.hostname}:${app.server?.port}`);