import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FALLBACK_PROJECT_WEBP = path.join(
  process.cwd(),
  'public',
  'uploads',
  'media',
  'project',
  'f09fdaff-63f0-4783-9d82-1acc642460bb',
  'cfb31520-cda5-4060-ac01-01ffd76d8179',
  'public_wm.webp'
);

const FALLBACK_DEVELOPER_LOGO_WEBP = path.join(
  process.cwd(),
  'public',
  'uploads',
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
    const safeSegments = segments
      .map((s) => s.replace(/\.\./g, '').replace(/^[/\\]+/, ''))
      .filter(Boolean);

    const requestedPath = path.join(process.cwd(), 'public', 'uploads', ...safeSegments);

    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      const ext = path.extname(requestedPath).toLowerCase();
      const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
      const buffer = await fs.promises.readFile(requestedPath);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      });
    }

    // Fallback when a database record references an ephemeral local upload not on disk
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
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
