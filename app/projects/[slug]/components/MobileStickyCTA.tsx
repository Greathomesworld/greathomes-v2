'use client';

import { MobileStickyCta } from '@/src/components/projects/MobileStickyCta';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';

interface MobileStickyCTAProps {
  project?: PublicProjectDto;
  projectName?: string;
  startingPrice?: number | null;
  ctaText?: string;
  targetSectionId?: string;
}

export function MobileStickyCTA(props: MobileStickyCTAProps) {
  return <MobileStickyCta {...props} />;
}

export { MobileStickyCta };
