import { OpenSearchConfig, SearchFilters, OpenSearchResponse, DocumentSource, FieldDefinition } from '../types';
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
      // Helper to convert numeric strings to numbers if they look like numbers
      // This is a simple heuristic; strictly speaking we should check the mapping type,
      // but OpenSearch often handles stringified numbers in ranges okay.
      const val = !isNaN(Number(f.value)) && f.value.trim() !== '' ? Number(f.value) : f.value;

      switch (f.operator) {
        case 'eq':
          // Use 'term' for precise matching on keyword/numbers
          filter.push({ term: { [f.field]: val } });
          break;
        case 'neq':
          mustNot.push({ term: { [f.field]: val } });
          break;
        case 'contains':
          // Use wildcards for partial matches (expensive but useful for exploration)
          // or 'match' for full text analysis
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

  // Helper to try request against multiple nodes
  private static async fetchWithFailover(config: OpenSearchConfig, path: string, options: RequestInit): Promise<any> {
    const nodes = config.nodes && config.nodes.length > 0 ? config.nodes : [];
    
    if (nodes.length === 0) {
      throw new Error("No OpenSearch nodes configured.");
    }

    let lastError: Error | null = null;

    for (const node of nodes) {
      // Remove trailing slash from node if present, ensure path starts with slash
      const cleanNode = node.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = `${cleanNode}${cleanPath}`;

      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
           // If it's a 4xx error (client error), we probably shouldn't retry on other nodes 
           // as the request is likely invalid, but for connection issues (5xx or network), we should.
           // For simplicity in this demo, we throw for everything to catch block, 
           // but strictly we might want to return 4xx immediately.
           // However, OpenSearch errors are often JSON bodies we want to read.
           const errorText = await response.text();
           throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.warn(`Failed to connect to node ${node}:`, err);
        lastError = err;
        // Continue to next node
      }
    }

    throw lastError || new Error("All nodes failed.");
  }

  static async getMapping(config: OpenSearchConfig): Promise<FieldDefinition[]> {
    if (config.useDemoMode) {
      const indexMapping = Object.values(MOCK_MAPPING)[0].mappings;
      return this.flattenMapping(indexMapping.properties);
    }

    const path = `/${config.index}/_mapping`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (config.accessKey && config.secretKey) {
        const authString = btoa(`${config.accessKey}:${config.secretKey}`);
        headers['Authorization'] = `Basic ${authString}`;
    }

    try {
      const data = await this.fetchWithFailover(config, path, { headers });
      
      // The response key is usually the index name
      const indexName = Object.keys(data)[0];
      const properties = data[indexName]?.mappings?.properties || {};
      
      return this.flattenMapping(properties);
    } catch (error) {
      console.error("Failed to get mapping", error);
      // Fallback to basic fields if mapping fails
      return [
        { path: 'id', type: 'keyword' },
        { path: 'status', type: 'keyword' },
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.accessKey && config.secretKey) {
        const authString = btoa(`${config.accessKey}:${config.secretKey}`);
        headers['Authorization'] = `Basic ${authString}`;
    }

    try {
      return await this.fetchWithFailover(config, path, {
        method: 'POST',
        headers,
        body: JSON.stringify(dsl)
      });
    } catch (error) {
      console.error("Search failed", error);
      throw error;
    }
  }
}