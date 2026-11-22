import path from 'path';

export const UPLOADS_BASE_DIR = path.resolve(process.cwd(), 'public', 'uploads');

const BLOCKED_SEGMENTS = new Set(['originals', 'private', 'brochures-private', '.env', '.git']);

/**
 * Strictly resolves and confines a requested upload path inside `public/uploads`.
 * Rejects dot-segments, null bytes, separators, hidden dotfiles, and private/original paths.
 */
export function resolveSafeUploadPath(
  segments: string[],
  baseDir: string = UPLOADS_BASE_DIR
): { ok: true; filePath: string; safeSegments: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 16) {
    return { ok: false, reason: 'invalid_segment_count' };
  }

  const safeSegments: string[] = [];
  for (const raw of segments) {
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'non_string_segment' };
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return { ok: false, reason: 'invalid_encoding' };
    }

    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('..') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0') ||
      decoded.startsWith('.')
    ) {
      return { ok: false, reason: 'unsafe_segment' };
    }

    const lower = decoded.toLowerCase();
    if (BLOCKED_SEGMENTS.has(lower) || lower.startsWith('original_')) {
      return { ok: false, reason: 'blocked_private_segment' };
    }

    safeSegments.push(decoded);
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...safeSegments);
  if (
    resolvedTarget === resolvedBase ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return { ok: false, reason: 'path_escape' };
  }

  return { ok: true, filePath: resolvedTarget, safeSegments };
}
