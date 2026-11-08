export function sanitizeAuditPayload(data: any): Record<string, any> | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const sensitiveKeys = [
    'password',
    'passhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'secret',
    'apikey',
    'api_key',
    'credential',
    'credentials',
    'creditcard',
    'cardnumber',
    'cvv',
    'payment',
    'ownerphone',
    'owneremail',
    'owner_phone',
    'owner_email',
    'brokerphone',
    'brokeremail',
    'privatephone',
    'private_phone',
    'privateemail',
    'private_email',
    'crmcredential',
    'crm_credential',
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const isSensitive = sensitiveKeys.some((s) => lowerKey === s || lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'object' ? sanitizeAuditPayload(item) : item
        );
      } else {
        sanitized[key] = sanitizeAuditPayload(value);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
