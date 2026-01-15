import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  label?: string;
  depth?: number;
  initialExpanded?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, label, depth = 0, initialExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded || depth < 1);

  const isObject = data !== null && typeof data === 'object';
  const isArray = Array.isArray(data);
  const isEmpty = isObject && Object.keys(data).length === 0;

  const toggle = () => setIsExpanded(!isExpanded);

  const indent = depth * 12; // pixels

  if (!isObject) {
    let valueColor = 'text-gray-600';
    let displayValue = String(data);

    if (typeof data === 'string') {
        valueColor = 'text-green-600';
        displayValue = `"${data}"`;
    } else if (typeof data === 'number') {
        valueColor = 'text-blue-600';
    } else if (typeof data === 'boolean') {
        valueColor = 'text-purple-600';
    } else if (data === null) {
        valueColor = 'text-gray-400';
        displayValue = 'null';
    }

    return (
      <div style={{ marginLeft: indent }} className="font-mono text-sm py-0.5">
        {label && <span className="text-slate-700 font-medium mr-1">{label}:</span>}
        <span className={valueColor}>{displayValue}</span>
      </div>
    );
  }

  return (
    <div className="font-mono text-sm">
      <div 
        onClick={toggle}
        className={`flex items-center cursor-pointer hover:bg-slate-100 rounded px-1 -ml-1 py-0.5 select-none ${depth > 0 ? '' : 'bg-slate-50 border border-slate-100'}`}
        style={{ marginLeft: indent }}
      >
        <div className="w-4 h-4 mr-1 flex items-center justify-center text-slate-500">
          {!isEmpty && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </div>
        {label && <span className="text-slate-700 font-medium mr-1">{label}:</span>}
        <span className="text-slate-500">
            {isArray ? '[' : '{'} 
            {!isExpanded && !isEmpty && <span className="text-slate-400 mx-1">...</span>}
            {isEmpty && (isArray ? ']' : '}')}
        </span>
      </div>

      {isExpanded && !isEmpty && (
        <div>
          {Object.entries(data).map(([key, value]) => (
            <JsonViewer 
                key={key} 
                data={value} 
                label={isArray ? undefined : key} 
                depth={depth + 1} 
            />
          ))}
          <div style={{ marginLeft: indent + 20 }} className="text-slate-500 py-0.5">
            {isArray ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
};