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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is acceptable if default sitemap URL is used
  }

  const feedpath = body.feedpath || body.url || body.sitemapUrl || 'https://greathomes.co.in/sitemap.xml';
  const siteUrl = body.siteUrl || body.property;

  try {
    // 1. Submit sitemap to Google Search Console
    const result = await searchConsoleService.submitSitemap(feedpath, siteUrl);

    // 2. Safely attempt audit logging without blocking or failing on audit error
    try {
      await auditService.record(
        req,
        { id: auth.staff?.id || null, role: auth.role || 'ADMIN' },
        {
          action: 'SITEMAP_SUBMITTED',
          resourceType: 'SITEMAP',
          resourceId: null, // Nullable: Sitemap URL is a target descriptor, not a database entity ID
          resourceLabel: feedpath,
          metadata: {
            feedPath: feedpath,
            property: result.siteUrl,
            submittedAt: result.submittedAt,
          },
          success: true,
        }
      );
    } catch (auditError) {
      console.error('[GoogleSitemap] Audit logging encountered an error (isolated):', auditError);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('[GoogleSitemap] Search Console sitemap submission error:', err);
    return NextResponse.json(
      {
        error: 'SITEMAP_SUBMIT_FAILED',
        message: err.message || 'Failed to submit sitemap to Google Search Console.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'MANAGE_SEO');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized access to Google Search Console operations' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    const { searchParams } = new URL(req.url);
    body = {
      feedpath: searchParams.get('feedpath') || searchParams.get('url'),
      siteUrl: searchParams.get('siteUrl') || searchParams.get('property'),
    };
  }

  const feedpath = body.feedpath || body.url || 'https://greathomes.co.in/sitemap.xml';
  const siteUrl = body.siteUrl || body.property;

  try {
    const result = await searchConsoleService.deleteSitemap(feedpath, siteUrl);

    try {
      await auditService.record(
        req,
        { id: auth.staff?.id || null, role: auth.role || 'ADMIN' },
        {
          action: 'SITEMAP_DELETED',
          resourceType: 'SITEMAP',
          resourceId: null,
          resourceLabel: feedpath,
          metadata: {
            feedPath: feedpath,
            property: result.siteUrl,
            deletedAt: result.deletedAt,
          },
          success: true,
        }
      );
    } catch (auditError) {
      console.error('[GoogleSitemap] Audit logging encountered an error (isolated):', auditError);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('[GoogleSitemap] Search Console sitemap deletion error:', err);
    return NextResponse.json(
      {
        error: 'SITEMAP_DELETE_FAILED',
        message: err.message || 'Failed to delete sitemap from Google Search Console.',
      },
      { status: 500 }
    );
  }
}
