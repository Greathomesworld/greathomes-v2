import {
  PublicProjectDto,
  deriveConfigurationsSummary,
  derivePossessionDisplay,
} from '@/src/domain/projects/dto/projectDto';
import { Maximize2, Building2, Home, Layers, Building, Calendar } from 'lucide-react';
import { ProjectMobileBrochureButton } from './ProjectBrochureModal';

interface ProjectSnapshotProps {
  project: PublicProjectDto;
}

/**
 * Formatters for the canonical Project Snapshot attributes.
 */
export function formatProjectArea(area?: string | null): string {
  if (!area || typeof area !== 'string' || area.trim().length === 0) {
    return '—';
  }
  const clean = area.trim();
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return `${clean} Acres`;
  }
  return clean;
}

export function formatTowerCount(count?: number | string | null): string {
  if (count === undefined || count === null || count === '') {
    return '—';
  }
  const num = typeof count === 'number' ? count : parseInt(String(count), 10);
  if (isNaN(num) || num <= 0) {
    if (typeof count === 'string' && count.trim().length > 0) {
      return count.trim();
    }
    return '—';
  }
  return `${num} ${num === 1 ? 'Tower' : 'Towers'}`;
}

export function formatTotalUnits(count?: number | string | null): string {
  if (count === undefined || count === null || count === '') {
    return '—';
  }
  const num = typeof count === 'number' ? count : parseInt(String(count).replace(/,/g, ''), 10);
  if (isNaN(num) || num <= 0) {
    if (typeof count === 'string' && count.trim().length > 0) {
      return count.trim();
    }
    return '—';
  }
  return `${num.toLocaleString('en-IN')} ${num === 1 ? 'Unit' : 'Units'}`;
}

export function formatConfigurations(
  configurationsSummary?: string | null,
  configurations?: PublicProjectDto['configurations']
): string {
  if (configurationsSummary && configurationsSummary.trim().length > 0) {
    return configurationsSummary.trim();
  }
  if (configurations && configurations.length > 0) {
    const derived = deriveConfigurationsSummary(configurations);
    if (derived) return derived;
  }
  return '—';
}

export function formatFloors(floors?: string | null): string {
  if (!floors || typeof floors !== 'string' || floors.trim().length === 0) {
    return '—';
  }
  return floors.trim();
}

export function formatPossession(
  possession?: string | null,
  possessionDate?: Date | string | null,
  possessionStatus?: string | null
): string | null {
  return derivePossessionDisplay(possession, undefined, possessionDate, possessionStatus);
}

export function resolveSnapshotPossession(project: PublicProjectDto): string | null {
  const rawPossessionDate =
    project.possessionDate ??
    project.snapshot?.possessionDate ??
    null;

  const rawPossessionStatus =
    project.possessionStatus ??
    project.snapshot?.possessionStatus ??
    project.snapshot?.possession ??
    project.possession ??
    null;

  return derivePossessionDisplay(rawPossessionStatus, undefined, rawPossessionDate, rawPossessionStatus);
}

export function ProjectSnapshot({ project }: ProjectSnapshotProps) {
  const snapshotData = project.snapshot ?? {
    projectArea: project.projectArea ?? null,
    towerCount: project.towerCount ?? null,
    totalUnits: project.totalUnits ?? null,
    configurations: project.configurationsSummary ?? null,
    floors: project.floors ?? null,
    possession: project.possession ?? null,
    possessionDate: project.possessionDate ?? null,
    possessionStatus: project.possessionStatus ?? null,
  };

  const projectAreaDisplay = formatProjectArea(snapshotData.projectArea);
  const towerCountDisplay = formatTowerCount(snapshotData.towerCount);
  const totalUnitsDisplay = formatTotalUnits(snapshotData.totalUnits);
  const configurationsDisplay = formatConfigurations(
    snapshotData.configurations,
    project.configurations
  );
  const floorsDisplay = formatFloors(snapshotData.floors);
  const possessionDisplay = resolveSnapshotPossession(project);

  const attributes = [
    {
      id: 'snapshot-area',
      label: 'Project Area',
      value: projectAreaDisplay,
      icon: Maximize2,
    },
    {
      id: 'snapshot-towers',
      label: 'Tower Count',
      value: towerCountDisplay,
      icon: Building2,
    },
    {
      id: 'snapshot-units',
      label: 'Total Units',
      value: totalUnitsDisplay,
      icon: Home,
    },
    {
      id: 'snapshot-configurations',
      label: 'Configurations',
      value: configurationsDisplay,
      icon: Layers,
    },
    {
      id: 'snapshot-floors',
      label: 'Floors',
      value: floorsDisplay,
      icon: Building,
    },
    ...(possessionDisplay
      ? [
          {
            id: 'snapshot-possession',
            label: 'Possession',
            value: possessionDisplay,
            icon: Calendar,
          },
        ]
      : []),
  ];

  return (
    <section
      id="snapshot"
      aria-labelledby="project-snapshot-heading"
      className="bg-[var(--color-foreground)]/[0.02] border border-[var(--color-border)] rounded-xl p-5 sm:p-6 md:p-8 space-y-6"
    >
      <div>
        <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] font-display mb-1">
          Great Homes Intelligence
        </div>
        <h2
          id="project-snapshot-heading"
          className="text-xl md:text-2xl font-display font-semibold text-[#111111]"
        >
          Project Snapshot
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
          Verified structural, legal, and financial intelligence for {project.name}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 sm:gap-y-8 gap-x-4 sm:gap-x-6 pt-6 border-t border-[var(--color-border)]">
        {attributes.map((attr) => {
          const Icon = attr.icon;
          return (
            <div key={attr.id} id={attr.id} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-foreground)]/60 font-display">
                <Icon className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" aria-hidden="true" />
                <span className="truncate">{attr.label}</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-[#111111] font-display leading-snug break-words">
                {attr.value}
              </div>
            </div>
          );
        })}
      </div>

      <ProjectMobileBrochureButton project={project} />
    </section>
  );
}
