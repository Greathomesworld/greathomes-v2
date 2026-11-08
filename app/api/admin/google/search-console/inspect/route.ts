import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { searchConsoleService } from '@/src/domain/google/searchConsoleService';
import { auditService } from '@/src/domain/audit/auditService';

export async function POST(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'MANAGE_SEO');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized access to Google Search Console operations' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Invalid JSON payload. Please provide a url string.' },
      { status: 400 }
    );
  }

  const targetUrl = body.url || body.targetUrl;
  const siteUrl = body.siteUrl || body.property;

  if (!targetUrl || typeof targetUrl !== 'string') {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'The "url" field is required and must be a valid URL string.' },
      { status: 400 }
    );
  }

  const trimmedUrl = targetUrl.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'URL must start with http:// or https://' },
      { status: 400 }
    );
  }

  try {
    // 1. Execute Google Search Console URL inspection
    const inspectionResult = await searchConsoleService.inspectUrl(trimmedUrl, siteUrl);

    // 2. Safely attempt audit logging without blocking or failing on audit error
    try {
      const parsed = new URL(trimmedUrl);
      await auditService.record(
        req,
        { id: auth.staff?.id || null, role: auth.role || 'ADMIN' },
        {
          action: 'SEARCH_CONSOLE_INSPECTION',
          resourceType: 'SEARCH_CONSOLE',
          resourceId: null, // Nullable: URL is a target descriptor, not a database entity ID
          resourceLabel: parsed.pathname || trimmedUrl,
          metadata: {
            url: trimmedUrl,
            property: siteUrl || 'https://greathomes.co.in',
            verdict: inspectionResult.inspectionResult.indexStatusResult.verdict,
            coverageState: inspectionResult.inspectionResult.indexStatusResult.coverageState,
            indexingState: inspectionResult.inspectionResult.indexStatusResult.indexingState,
            crawledAs: inspectionResult.inspectionResult.indexStatusResult.crawledAs,
            lastCrawlTime: inspectionResult.inspectionResult.indexStatusResult.lastCrawlTime,
          },
          success: true,
        }
      );
    } catch (auditError) {
      // Server-side observability: log audit failure without exposing internals to client
      console.error('[GoogleInspection] Audit logging encountered an error (isolated):', auditError);
    }

    // 3. Return Google inspection response successfully
    return NextResponse.json({
      success: true,
      data: inspectionResult,
    });
  } catch (err: any) {
    console.error('[GoogleInspection] Search Console URL inspection error:', err);
    return NextResponse.json(
      {
        error: 'INSPECTION_FAILED',
        message: err.message || 'Failed to inspect URL with Google Search Console.',
      },
      { status: 500 }
    );
  }
}
