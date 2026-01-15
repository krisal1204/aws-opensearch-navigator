import { OpenSearchResponse, DocumentSource, FieldFilter } from '../types';

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

const getNested = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export const generateMockResponse = (from: number, size: number, queryStr: string, filters: FieldFilter[] = []): Promise<OpenSearchResponse<DocumentSource>> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate a larger pool to allow for some filtering effects
      const poolSize = size * 5; 
      let hits = Array.from({ length: poolSize }).map((_, i) => {
        const id = from + i;
        const lat = 34.05 + (Math.random() - 0.5);
        const lon = -118.25 + (Math.random() - 0.5);
        const isError = Math.random() > 0.8;
        
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
            status: isError ? 'ERROR' : 'SUCCESS',
            timestamp: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toISOString(),
            metadata: {
              host: `ip-10-0-1-${Math.floor(Math.random() * 255)}`,
              latency_ms: Math.floor(Math.random() * 500),
              tags: ['production', 'aws', 'serverless']
            }
          }
        };
      });

      // Apply Query Filter (simple implementation)
      if (queryStr) {
          const q = queryStr.toLowerCase();
          hits = hits.filter(h => 
              h._source.name.toLowerCase().includes(q) || 
              h._source.description.toLowerCase().includes(q)
          );
      }

      // Apply Field Filters
      if (filters && filters.length > 0) {
          hits = hits.filter(h => {
              return filters.every(f => {
                  const val = getNested(h._source, f.field);
                  // Basic coercion
                  const compareVal = !isNaN(Number(f.value)) && f.value !== '' ? Number(f.value) : f.value;
                  const sourceVal = !isNaN(Number(val)) && val !== null ? Number(val) : val;

                  switch (f.operator) {
                      case 'eq': return String(sourceVal) == String(compareVal);
                      case 'neq': return String(sourceVal) != String(compareVal);
                      case 'contains': return String(sourceVal).toLowerCase().includes(String(compareVal).toLowerCase());
                      case 'gt': return sourceVal > compareVal;
                      case 'lt': return sourceVal < compareVal;
                      case 'gte': return sourceVal >= compareVal;
                      case 'lte': return sourceVal <= compareVal;
                      case 'exists': return val !== undefined && val !== null;
                      default: return true;
                  }
              });
          });
      }

      // Slice to requested page size
      const pagedHits = hits.slice(0, size);

      resolve({
        took: 12,
        timed_out: false,
        hits: {
          total: {
            value: 1250, // Mock total
            relation: 'eq'
          },
          max_score: 1.0,
          hits: pagedHits
        }
      });
    }, 600); 
  });
};