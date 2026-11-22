import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeUploadPath, UPLOADS_BASE_DIR } from '@/src/lib/uploadPathSafety';

const FALLBACK_PROJECT_WEBP = path.join(
  UPLOADS_BASE_DIR,
  'media',
  'project',
  'f09fdaff-63f0-4783-9d82-1acc642460bb',
  'cfb31520-cda5-4060-ac01-01ffd76d8179',
  'public_wm.webp'
);

const FALLBACK_DEVELOPER_LOGO_WEBP = path.join(
  UPLOADS_BASE_DIR,
  'media',
  'developer',
  'dev-123',
  '38a4155e-ddb1-4522-afc1-273775b3612a',
  'logo.webp'
);

const MIME_BY_EXT: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await context.params;
    const segments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];
    const resolution = resolveSafeUploadPath(segments);

    if (!resolution.ok) {
      return new NextResponse(null, {
        status: 400,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });
    }

    const { filePath: requestedPath, safeSegments } = resolution;

    if (fs.existsSync(requestedPath)) {
      const realBase = await fs.promises.realpath(UPLOADS_BASE_DIR).catch(() => UPLOADS_BASE_DIR);
      const realTarget = await fs.promises.realpath(requestedPath).catch(() => null);
      if (
        !realTarget ||
        realTarget === realBase ||
        !realTarget.startsWith(realBase + path.sep)
      ) {
        return new NextResponse(null, {
          status: 403,
          headers: { 'X-Content-Type-Options': 'nosniff' },
        });
      }

      const stat = await fs.promises.stat(realTarget);
      if (stat.isFile()) {
        const ext = path.extname(realTarget).toLowerCase();
        const contentType = MIME_BY_EXT[ext];
        if (!contentType) {
          return new NextResponse(null, {
            status: 404,
            headers: { 'X-Content-Type-Options': 'nosniff' },
          });
        }

        const buffer = await fs.promises.readFile(realTarget);
        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        };

        if (ext === '.svg') {
          headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
          headers['Content-Disposition'] = 'inline';
        }

        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers,
        });
      }
    }

    // Fallback when a database record references an ephemeral local image not on disk
    const ext = path.extname(requestedPath).toLowerCase();
    const isImageRequest = ['.webp', '.avif', '.jpg', '.jpeg', '.png'].includes(ext);
    if (!isImageRequest) {
      return new NextResponse(null, {
        status: 404,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });
    }

    const isDeveloperLogo = safeSegments.includes('developer');
    const fallbackFile =
      isDeveloperLogo && fs.existsSync(FALLBACK_DEVELOPER_LOGO_WEBP)
        ? FALLBACK_DEVELOPER_LOGO_WEBP
        : FALLBACK_PROJECT_WEBP;

    if (fs.existsSync(fallbackFile)) {
      const buffer = await fs.promises.readFile(fallbackFile);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
