export const sanitizeAuditPayload = (data: any): any => {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    // Check if it's a base64 data URL
    if (data.startsWith('data:') && data.includes('base64,')) {
      return '[FILE_DATA_OMITTED]';
    }
    // Truncate massive strings
    if (data.length > 500) {
      return data.substring(0, 500) + '... [TRUNCATED]';
    }
    return data;
  }
  
  if (Array.isArray(data)) {
    const limit = 50;
    if (data.length > limit) {
      const truncatedArr = data.slice(0, limit).map(item => sanitizeAuditPayload(item));
      truncatedArr.push(`[ARRAY_TRUNCATED_AT_${limit}_ITEMS]`);
      return truncatedArr;
    }
    return data.map(item => sanitizeAuditPayload(item));
  }
  
  if (typeof data === 'object') {
    const cleanObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Explicit check for raw_source_text, though the general string check will catch it too
        if (key === 'raw_source_text' && typeof data[key] === 'string') {
          if (data[key].length > 500) {
            cleanObj[key] = data[key].substring(0, 500) + '... [TRUNCATED]';
          } else {
            cleanObj[key] = data[key];
          }
        } else {
          cleanObj[key] = sanitizeAuditPayload(data[key]);
        }
      }
    }
    return cleanObj;
  }
  
  return data;
};
