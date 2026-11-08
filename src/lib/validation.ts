export function isValidUuid(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length <= 150;
}

export function boundedString(str: any, maxLength: number = 255): string | null {
  if (str === null || str === undefined) return null;
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed) return null;
  return trimmed.substring(0, maxLength);
}

export function boundedNumber(num: any, min?: number, max?: number): number | null {
  if (num === null || num === undefined) return null;
  const parsed = Number(num);
  if (isNaN(parsed)) return null;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

export function boundedPagination(pageInput: any, pageSizeInput: any, maxPageSize: number = 100): { page: number; pageSize: number; offset: number } {
  let page = parseInt(pageInput, 10);
  if (isNaN(page) || page < 1) page = 1;

  let pageSize = parseInt(pageSizeInput, 10);
  if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function sanitizeSearchTerm(query: any, maxLength: number = 100): string | null {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim().replace(/[%_]/g, ''); // strip sql wildcard injections
  if (!trimmed) return null;
  return trimmed.substring(0, maxLength);
}
