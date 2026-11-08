'use client';

import {
  ProjectTypologiesSection,
  ProjectTypologiesSectionProps,
} from './typologies';

export type ProjectConfigurationsSectionProps = ProjectTypologiesSectionProps;

/**
 * ProjectConfigurationsSection
 * Canonical Great Homes Project Configurations & Typologies section.
 * Backwards-compatible export mapping to ProjectTypologiesSection.
 */
export function ProjectConfigurationsSection(props: ProjectConfigurationsSectionProps) {
  return <ProjectTypologiesSection {...props} />;
}
