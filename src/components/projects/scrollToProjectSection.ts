/**
 * Shared scroll-offset constant and helper for Great Homes V2 project detail pages.
 *
 * Accounts for:
 * - Global sticky Header (`h-16` = 64px on <640px, `sm:h-18` = 72px on >=640px)
 * - Sticky ProjectSectionNavigation (`~45px` height, pinned at `top-16 sm:top-18`)
 * - Visual breathing buffer (`~15px–23px`) above target section headings
 */
export const PROJECT_SECTION_SCROLL_OFFSET = -132;

export function scrollToProjectSection(
  sectionId: string,
  yOffset: number = PROJECT_SECTION_SCROLL_OFFSET
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const el = document.getElementById(sectionId);
  if (!el) {
    return false;
  }

  const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset + yOffset);
  window.scrollTo({ top: y, behavior: 'smooth' });
  return true;
}
