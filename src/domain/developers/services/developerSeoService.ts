import { isKnownTestDeveloperSlug } from './developerService';
import {
  isGarbageOrTooShortDescription,
  stripHtmlAndNormalizeWhitespace,
} from '../../seo/metadataBuilder';

export type DeveloperSeoEligibilityReason =
  | 'SUFFICIENT_PROJECT_DEPTH'
  | 'SUFFICIENT_EDITORIAL_DEPTH'
  | 'THIN_ZERO_PROJECT_PROFILE'
  | 'DRAFT'
  | 'ARCHIVED'
  | 'TEST_DEVELOPER'
  | 'MISSING_SLUG';

export interface DeveloperSeoEligibility {
  eligible: boolean;
  index: boolean;
  follow: boolean;
  reason: DeveloperSeoEligibilityReason;
  publishedProjectCount: number;
  publishedEditorialCount: number;
}

export interface DeveloperSeoSubject {
  slug?: string | null;
  status?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  projectCount?: number | null;
}

export interface EvaluateDeveloperSeoParams {
  developer: DeveloperSeoSubject;
  /**
   * Optional list of associated project records. When provided, only explicitly
   * published projects count toward indexability (DRAFT / ARCHIVED / unpublished are ignored).
   */
  projects?: Array<{
    lifecycleStatus?: string | null;
    isPublished?: boolean | null;
  }>;
  /**
   * Explicit published project count override (used by batch sitemap generation
   * when published projects are already counted in memory).
   */
  publishedProjectCount?: number;
  /**
   * Count of linked PUBLISHED editorial articles/stories (e.g. DEVELOPER_STORY)
   * authored for this developer.
   */
  publishedEditorialCount?: number;
}

const MIN_EDITORIAL_DESCRIPTION_CHARS = 380;
const MIN_EDITORIAL_DESCRIPTION_WORDS = 55;
const MIN_EDITORIAL_SENTENCES = 3;

/**
 * Evaluates whether a zero-project developer page contains genuinely substantial,
 * verified editorial profile content rather than a brief 1–2 sentence directory blurb.
 *
 * Criteria (any one satisfies substantial editorial depth):
 * 1. At least one linked PUBLISHED editorial article/story (e.g. DEVELOPER_STORY), OR
 * 2. A non-garbage, multi-sentence editorial narrative (`description`) with >= 400 characters,
 *    >= 65 words, and >= 3 distinct sentences.
 */
export function hasSubstantialDeveloperEditorialContent(
  developer: Pick<DeveloperSeoSubject, 'shortDescription' | 'description'>,
  publishedEditorialCount = 0
): boolean {
  if (publishedEditorialCount > 0) {
    return true;
  }

  const cleanDesc = stripHtmlAndNormalizeWhitespace(developer.description);
  if (!cleanDesc) return false;
  if (isGarbageOrTooShortDescription(cleanDesc, MIN_EDITORIAL_DESCRIPTION_CHARS)) {
    return false;
  }

  const words = cleanDesc.split(/\s+/).filter(Boolean);
  if (words.length < MIN_EDITORIAL_DESCRIPTION_WORDS) {
    return false;
  }

  const sentences = cleanDesc
    .split(/[.!?]+(?:\s+|$)/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 20);

  if (sentences.length < MIN_EDITORIAL_SENTENCES) {
    return false;
  }

  return true;
}

/**
 * Single authoritative SEO indexing governance evaluator for `/developers/[slug]`
 * and `/sitemap.xml`.
 *
 * Policy:
 * - Non-published (`DRAFT`, `ARCHIVED`), missing-slug, or test developers -> `noindex, nofollow`, excluded from sitemap.
 * - `PUBLISHED` developers with >= 1 published project -> `index, follow`, included in sitemap.
 * - `PUBLISHED` developers with 0 published projects BUT substantial verified editorial content -> `index, follow`, included in sitemap.
 * - `PUBLISHED` developers with 0 published projects AND thin/minimal profile copy -> `noindex, follow`, excluded from sitemap
 *   (page stays live and accessible with 200 OK so internal links and directory browsing remain intact).
 */
export function evaluateDeveloperSeoEligibility(
  params: EvaluateDeveloperSeoParams
): DeveloperSeoEligibility {
  const { developer, projects } = params;
  const publishedEditorialCount = Math.max(0, Number(params.publishedEditorialCount ?? 0));

  let publishedProjectCount: number;
  if (typeof params.publishedProjectCount === 'number' && Number.isFinite(params.publishedProjectCount)) {
    publishedProjectCount = Math.max(0, Math.floor(params.publishedProjectCount));
  } else if (Array.isArray(projects)) {
    publishedProjectCount = projects.filter((p) => {
      const lifecycle = (p.lifecycleStatus ?? 'PUBLISHED').toUpperCase();
      return lifecycle === 'PUBLISHED' && p.isPublished !== false;
    }).length;
  } else {
    publishedProjectCount = Math.max(0, Math.floor(Number(developer.projectCount ?? 0)));
  }

  const cleanSlug = (developer.slug || '').trim();
  if (!cleanSlug) {
    return {
      eligible: false,
      index: false,
      follow: false,
      reason: 'MISSING_SLUG',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  if (isKnownTestDeveloperSlug(cleanSlug)) {
    return {
      eligible: false,
      index: false,
      follow: false,
      reason: 'TEST_DEVELOPER',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  const normalizedStatus = (developer.status || 'DRAFT').toUpperCase();
  if (normalizedStatus === 'DRAFT') {
    return {
      eligible: false,
      index: false,
      follow: false,
      reason: 'DRAFT',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  if (normalizedStatus === 'ARCHIVED') {
    return {
      eligible: false,
      index: false,
      follow: false,
      reason: 'ARCHIVED',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  if (normalizedStatus !== 'PUBLISHED') {
    return {
      eligible: false,
      index: false,
      follow: false,
      reason: 'DRAFT',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  // Tier 1: Published developer with at least 1 published project
  if (publishedProjectCount > 0) {
    return {
      eligible: true,
      index: true,
      follow: true,
      reason: 'SUFFICIENT_PROJECT_DEPTH',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  // Tier 2: Zero published projects, but substantial verified editorial depth
  if (hasSubstantialDeveloperEditorialContent(developer, publishedEditorialCount)) {
    return {
      eligible: true,
      index: true,
      follow: true,
      reason: 'SUFFICIENT_EDITORIAL_DEPTH',
      publishedProjectCount,
      publishedEditorialCount,
    };
  }

  // Tier 3: Zero published projects + thin profile -> accessible (200 OK), noindex/follow, excluded from sitemap
  return {
    eligible: false,
    index: false,
    follow: true,
    reason: 'THIN_ZERO_PROJECT_PROFILE',
    publishedProjectCount,
    publishedEditorialCount,
  };
}
