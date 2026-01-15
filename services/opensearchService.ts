import { OpenSearchConfig, SearchFilters, OpenSearchResponse, DocumentSource, FieldDefinition, IndexInfo } from '../types';
import { generateMockResponse, MOCK_MAPPING } from './mockData';

export class OpenSearchService {
  
  static buildDsl(filters: SearchFilters, config: OpenSearchConfig) {
    const must: any[] = [];
    const filter: any[] = [];
    const mustNot: any[] = [];

    // Text Query
    if (filters.query.trim()) {
      must.push({
        multi_match: {
          query: filters.query,
          fields: ["name^2", "description", "metadata.*", "*"]
        }
      });
    } else {
      must.push({ match_all: {} });
    }

    // Geo Filter
    if (filters.geo.enabled) {
      const geoField = config.geoField || 'location';
      filter.push({
        geo_distance: {
          distance: `${filters.geo.radius}${filters.geo.unit}`,
          [geoField]: {
            lat: filters.geo.latitude,
            lon: filters.geo.longitude
          }
        }
      });
    }

    // Dynamic Field Filters
    filters.fieldFilters.forEach(f => {
      const val = !isNaN(Number(f.value)) && f.value.trim() !== '' ? Number(f.value) : f.value;

      switch (f.operator) {
        case 'eq':
          filter.push({ term: { [f.field]: val } });
          break;
        case 'neq':
          mustNot.push({ term: { [f.field]: val } });
          break;
        case 'contains':
          must.push({ match: { [f.field]: val } });
          break;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
          filter.push({ range: { [f.field]: { [f.operator]: val } } });
          break;
        case 'exists':
          filter.push({ exists: { field: f.field } });
          break;
      }
    });

    return {
      from: filters.from,
      size: filters.size,
      query: {
        bool: {
          must,
          filter,
          must_not: mustNot
        }
      },
      sort: [
        { "_score": { "order": "desc" } }
      ]
    };
  }

  static flattenMapping(properties: any, prefix = ''): FieldDefinition[] {
    let fields: FieldDefinition[] = [];
    for (const key in properties) {
      const prop = properties[key];
      const path = prefix ? `${prefix}.${key}` : key;
      if (prop.properties) {
        fields = [...fields, ...this.flattenMapping(prop.properties, path)];
      } else {
        fields.push({ path, type: prop.type });
      }
    }
    return fields;
  }

  // Unified fetcher that decides whether to use Proxy or Direct
  private static async executeRequest(config: OpenSearchConfig, path: string, method: string = 'GET', bodyData?: any): Promise<any> {
     const nodes = config.nodes && config.nodes.length > 0 ? config.nodes : [];
    
     if (nodes.length === 0) {
       throw new Error("No OpenSearch nodes configured.");
     }
 
     // Use the first node for simplicity in proxy mode, or iterate if needed
     // For this implementation, we try node 0.
     const node = nodes[0].replace(/\/$/, '');
     const cleanPath = path.startsWith('/') ? path : `/${path}`;
     const targetUrl = `${node}${cleanPath}`;

     const proxyUrl = config.proxyUrl || 'http://localhost:3000/api/proxy';

     // PROXY REQUEST
     const payload: any = {
       url: targetUrl,
       method,
       data: bodyData,
       region: config.region
     };

     // If profile is selected, send profile name. Server will resolve credentials.
     if (config.profile) {
       payload.profile = config.profile;
     } else {
       // Otherwise send manual credentials
       payload.credentials = {
         accessKey: config.accessKey,
         secretKey: config.secretKey,
         sessionToken: config.sessionToken
       };
     }

     try {
       const res = await fetch(proxyUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(payload)
       });

       if (!res.ok) {
         throw new Error(`Proxy unreachable: ${res.statusText}`);
       }

       const result = await res.json();
       if (result.status >= 300) {
         const msg = result.data?.error || result.data?.message || JSON.stringify(result.data) || 'Unknown Error';
         throw new Error(`OpenSearch Error (${result.status}): ${msg}`);
       }

       return result.data;
     } catch (err) {
       console.error("Request execution failed", err);
       throw err;
     }
  }

  static async getIndices(config: OpenSearchConfig): Promise<IndexInfo[]> {
    if (config.useDemoMode) {
      return [{ index: 'demo-index', health: 'green', status: 'open', docsCount: '1250', storeSize: '10mb' }];
    }

    try {
      // Use _cat/indices with json format
      const data = await this.executeRequest(config, '/_cat/indices?format=json', 'GET');
      
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          index: item.index,
          health: item.health,
          status: item.status,
          docsCount: item['docs.count'],
          storeSize: item['store.size']
        }));
      }
      return [];
    } catch (err) {
      console.warn("Failed to fetch indices", err);
      // Return empty array instead of throwing to prevent UI crash
      return [];
    }
  }

  static async getMapping(config: OpenSearchConfig): Promise<FieldDefinition[]> {
    if (config.useDemoMode) {
      const indexMapping = Object.values(MOCK_MAPPING)[0].mappings;
      return this.flattenMapping(indexMapping.properties);
    }

    try {
      const data = await this.executeRequest(config, `/${config.index}/_mapping`, 'GET');
      
      // The response key is usually the index name
      // data might be { "my-index": { mappings: ... } }
      const indexName = Object.keys(data)[0];
      const properties = data[indexName]?.mappings?.properties || {};
      
      return this.flattenMapping(properties);
    } catch (error) {
      console.error("Failed to get mapping", error);
      return [
        { path: 'id', type: 'keyword' },
        { path: 'timestamp', type: 'date' }
      ];
    }
  }

  static async search(config: OpenSearchConfig, filters: SearchFilters): Promise<OpenSearchResponse<DocumentSource>> {
    if (config.useDemoMode) {
      return generateMockResponse(filters.from, filters.size, filters.query);
    }

    const dsl = this.buildDsl(filters, config);
    const path = `/${config.index}/_search`;

    return await this.executeRequest(config, path, 'POST', dsl);
  }
}