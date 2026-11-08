import { validateCanonicalUrl } from '@/src/domain/seo/auditEngine';

export interface SearchConsoleInspectionResult {
  simulated: true;
  mode: 'SIMULATED_PREVIEW';
  notice: string;
  inspectionResult: {
    inspectionResultLink: string;
    indexStatusResult: {
      verdict: 'PASS' | 'NEUTRAL' | 'FAIL';
      coverageState: string;
      indexingState: string;
      lastCrawlTime: string;
      pageFetchState: string;
      robotsTxtState: string;
      crawledAs: string;
      userCanonical?: string;
      googleCanonical?: string;
      referringUrls?: string[];
    };
    mobileUsabilityResult?: {
      verdict: 'PASS' | 'FAIL';
      issues?: Array<{ issueType: string; severity: string }>;
    };
    richResultsResult?: {
      verdict: 'PASS' | 'NEUTRAL';
      detectedItems?: Array<{ richResultType: string; items: Array<{ name: string }> }>;
    };
  };
}

const SIMULATION_NOTICE =
  'SIMULATED / PREVIEW MODE: No live Google Search Console OAuth client or API credentials are connected. Results below are local structural previews, not live Google index confirmations.';

export class SearchConsoleService {
  private defaultProperty = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY || 'https://greathomes.co.in';

  /**
   * Simulates URL inspection structure adhering to Google Search Console URL Inspection API v1.
   * Explicitly marked as SIMULATED_PREVIEW so administrators never mistake local preview output for live Google indexing.
   */
  async inspectUrl(targetUrl: string, siteUrl?: string): Promise<SearchConsoleInspectionResult> {
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error('A valid target URL is required for URL inspection.');
    }

    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      throw new Error('Target URL must be a fully qualified URL starting with http:// or https://');
    }

    const property = siteUrl || this.defaultProperty;
    const now = new Date();

    const isBlockedByRobots =
      trimmedUrl.includes('/admin') ||
      trimmedUrl.includes('/api/') ||
      trimmedUrl.includes('/account');

    const canonicalCheck = validateCanonicalUrl(trimmedUrl);
    const isEligibleRoute = !isBlockedByRobots && canonicalCheck.valid;

    const isProject = trimmedUrl.includes('/projects/');
    const isDeveloper = trimmedUrl.includes('/developers/');
    const isLocation = trimmedUrl.includes('/locations/');
    const isListing = trimmedUrl.includes('/buy/') || trimmedUrl.includes('/rent/');

    return {
      simulated: true,
      mode: 'SIMULATED_PREVIEW',
      notice: SIMULATION_NOTICE,
      inspectionResult: {
        inspectionResultLink: `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(property)}&id=${encodeURIComponent(trimmedUrl)}`,
        indexStatusResult: {
          verdict: isEligibleRoute ? 'PASS' : 'NEUTRAL',
          coverageState: isBlockedByRobots
            ? 'Simulated Preview: Blocked by robots.txt'
            : isEligibleRoute
            ? 'Simulated Preview: Eligible canonical route structure'
            : `Simulated Preview: Non-canonical URL (${canonicalCheck.reason || 'unrecognized route pattern'})`,
          indexingState: isBlockedByRobots
            ? 'BLOCKED_BY_ROBOTS_TXT'
            : isEligibleRoute
            ? 'INDEXING_ALLOWED_SIMULATED'
            : 'EXCLUDED_NON_CANONICAL_SIMULATED',
          lastCrawlTime: now.toISOString(),
          pageFetchState: isBlockedByRobots ? 'BLOCKED_ROBOTS_TXT' : 'SIMULATED_LOCAL_CHECK',
          robotsTxtState: isBlockedByRobots ? 'DISALLOWED' : 'ALLOWED',
          crawledAs: 'GOOGLEBOT_SMARTPHONE',
          userCanonical: trimmedUrl,
          googleCanonical: isEligibleRoute ? trimmedUrl : undefined,
          referringUrls: isEligibleRoute ? [`${property}/sitemap.xml`] : [],
        },
        mobileUsabilityResult: {
          verdict: 'PASS',
          issues: [],
        },
        richResultsResult: {
          verdict: isEligibleRoute ? 'PASS' : 'NEUTRAL',
          detectedItems: isEligibleRoute
            ? [
                {
                  richResultType: 'Breadcrumbs',
                  items: [{ name: 'BreadcrumbList (Simulated Preview)' }],
                },
                ...(isProject
                  ? [
                      {
                        richResultType: 'Residence / ApartmentComplex',
                        items: [{ name: 'ApartmentComplex / SingleFamilyResidence (Simulated Preview)' }],
                      },
                    ]
                  : []),
                ...(isDeveloper
                  ? [
                      {
                        richResultType: 'Organization',
                        items: [{ name: 'Organization / RealEstateAgent (Simulated Preview)' }],
                      },
                    ]
                  : []),
                ...(isLocation
                  ? [
                      {
                        richResultType: 'Place',
                        items: [{ name: 'Place (Simulated Preview)' }],
                      },
                    ]
                  : []),
                ...(isListing
                  ? [
                      {
                        richResultType: 'Accommodation',
                        items: [{ name: 'Apartment + Offer (Simulated Preview)' }],
                      },
                    ]
                  : []),
              ]
            : [],
        },
      },
    };
  }

  /**
   * Simulates a sitemap feed submission payload for preview/testing.
   */
  async submitSitemap(
    feedpath: string,
    siteUrl?: string
  ): Promise<{
    success: boolean;
    simulated: true;
    mode: 'SIMULATED_PREVIEW';
    notice: string;
    feedpath: string;
    siteUrl: string;
    submittedAt: string;
  }> {
    if (!feedpath || typeof feedpath !== 'string') {
      throw new Error('A valid sitemap URL or feed path is required.');
    }

    const property = siteUrl || this.defaultProperty;
    return {
      success: true,
      simulated: true,
      mode: 'SIMULATED_PREVIEW',
      notice: SIMULATION_NOTICE,
      feedpath: feedpath.trim(),
      siteUrl: property,
      submittedAt: new Date().toISOString(),
    };
  }

  /**
   * Simulates deleting a sitemap feed path in preview mode.
   */
  async deleteSitemap(
    feedpath: string,
    siteUrl?: string
  ): Promise<{
    success: boolean;
    simulated: true;
    mode: 'SIMULATED_PREVIEW';
    notice: string;
    feedpath: string;
    siteUrl: string;
    deletedAt: string;
  }> {
    if (!feedpath || typeof feedpath !== 'string') {
      throw new Error('A valid sitemap URL or feed path is required.');
    }

    const property = siteUrl || this.defaultProperty;
    return {
      success: true,
      simulated: true,
      mode: 'SIMULATED_PREVIEW',
      notice: SIMULATION_NOTICE,
      feedpath: feedpath.trim(),
      siteUrl: property,
      deletedAt: new Date().toISOString(),
    };
  }
}

export const searchConsoleService = new SearchConsoleService();
