import { OpenSearchResponse, DocumentSource } from '../types';

export const MOCK_MAPPING = {
  "demo-index": {
    "mappings": {
      "properties": {
        "id": { "type": "keyword" },
        "name": { "type": "text" },
        "description": { "type": "text" },
        "status": { "type": "keyword" },
        "timestamp": { "type": "date" },
        "location": { "type": "geo_point" },
        "metadata": {
          "properties": {
             "host": { "type": "keyword" },
             "latency_ms": { "type": "integer" },
             "tags": { "type": "keyword" }
          }
        }
      }
    }
  }
};

export const generateMockResponse = (from: number, size: number, queryStr: string): Promise<OpenSearchResponse<DocumentSource>> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const hits = Array.from({ length: size }).map((_, i) => {
        const id = from + i;
        const lat = 34.05 + (Math.random() - 0.5);
        const lon = -118.25 + (Math.random() - 0.5);
        
        return {
          _index: 'demo-index',
          _id: `doc-${id}`,
          _score: 1.0,
          _source: {
            id: `usr_${id}`,
            name: `Service Log #${id}`,
            description: queryStr ? `Result matching "${queryStr}" - simulated log entry` : `System heartbeat log entry #${id}`,
            location: {
              lat: parseFloat(lat.toFixed(4)),
              lon: parseFloat(lon.toFixed(4))
            },
            status: Math.random() > 0.8 ? 'ERROR' : 'SUCCESS',
            timestamp: new Date().toISOString(),
            metadata: {
              host: `ip-10-0-1-${Math.floor(Math.random() * 255)}`,
              latency_ms: Math.floor(Math.random() * 500),
              tags: ['production', 'aws', 'serverless']
            }
          }
        };
      });

      resolve({
        took: 12,
        timed_out: false,
        hits: {
          total: {
            value: 1250,
            relation: 'eq'
          },
          max_score: 1.0,
          hits
        }
      });
    }, 600); // Simulate network latency
  });
};