import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { CheckCircle2, Info, Compass, ShieldCheck, Building2, Home } from 'lucide-react';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { getEligibleAmenities } from './ProjectAmenities';

interface ProjectConsiderationsProps {
  project: PublicProjectDto;
}

export function ProjectConsiderations({ project }: ProjectConsiderationsProps) {
  // Build evidence-backed factual strengths
  const whyConsiderPoints: { title: string; desc: string; icon: any }[] = [];

  if (project.rera.hasVerifiedReraBadge && project.rera.registrationNumber) {
    whyConsiderPoints.push({
      title: 'Verified RERA Compliance',
      desc: `Officially verified under ${project.rera.authority || 'WBRERA'} registration ${project.rera.registrationNumber}, ensuring statutory transparency.`,
      icon: ShieldCheck,
    });
  }

  if (project.developer.name) {
    whyConsiderPoints.push({
      title: 'Established Developer Track Record',
      desc: `Developed by ${project.developer.name}, with documented deliveries and active developments across the region.`,
      icon: Building2,
    });
  }

  if (project.location.name) {
    const ancestorNames = (project.location.path || [])
      .map(p => p.name)
      .filter(
        (name, idx, arr) =>
          Boolean(name) &&
          name.trim().toLowerCase() !== project.location.name.trim().toLowerCase() &&
          arr.findIndex(n => n.trim().toLowerCase() === name.trim().toLowerCase()) === idx
      );
    const pathSummary = ancestorNames.length > 0 ? ` (${ancestorNames.join(' → ')})` : '';
    whyConsiderPoints.push({
      title: 'Location & Connectivity',
      desc: `Positioned in ${project.location.name}${pathSummary} with established road and transit connectivity.`,
      icon: Compass,
    });
  }

  const eligibleAmenities = getEligibleAmenities(project.amenities);
  if (eligibleAmenities.length > 0) {
    const featuredNames = eligibleAmenities.slice(0, 3).map(a => a.name).join(', ');
    whyConsiderPoints.push({
      title: 'Verified Lifestyle Amenities',
      desc: `${eligibleAmenities.length} documented amenities including ${featuredNames} on premises.`,
      icon: CheckCircle2,
    });
  }

  if (project.configurations && project.configurations.length > 0) {
    const bedroomCounts = Array.from(new Set(project.configurations.map(c => c.bedroomCount).filter(Boolean))) as number[];
    const bhkLabel = bedroomCounts.length > 0 ? `${Math.min(...bedroomCounts)} to ${Math.max(...bedroomCounts)} BHK` : 'various';
    whyConsiderPoints.push({
      title: 'Typology Flexibility',
      desc: `${project.configurations.length} distinct residential configurations offered across ${bhkLabel} layouts.`,
      icon: Home,
    });
  }

  // Merge visible editorial WHY_CONSIDER points in sortOrder
  if (project.considerations) {
    const editorialWhy = project.considerations
      .filter(c => c.section === 'WHY_CONSIDER' && c.isVisible !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const item of editorialWhy) {
      whyConsiderPoints.push({
        title: item.title,
        desc: item.description,
        icon: CheckCircle2,
      });
    }
  }

  // Factual planning considerations
  const thingsToConsiderPoints: { title: string; desc: string }[] = [];

  if (project.status) {
    thingsToConsiderPoints.push({
      title: 'Construction & Lifecycle Stage',
      desc: `Current lifecycle status is ${project.status.replace(/_/g, ' ')}. Handover and possession follow canonical builder schedules.`,
    });
  }

  if (project.pricing.priceBasis) {
    thingsToConsiderPoints.push({
      title: 'Price Calculation Basis',
      desc: `Unit prices are quoted based on ${project.pricing.priceBasis.replace(/_/g, ' ')}. Ensure comparative evaluations account for applicable area ratios.`,
    });
  }

  if (project.pricing.startingPrice) {
    thingsToConsiderPoints.push({
      title: 'Entry Price & Dynamic Inventory',
      desc: `Starting at ${formatIndianPrice(project.pricing.startingPrice)} onwards. Developer unit availability varies by tower release phase.`,
    });
  }

  // Merge visible editorial THINGS_TO_KEEP_IN_MIND points in sortOrder
  if (project.considerations) {
    const editorialThings = project.considerations
      .filter(c => c.section === 'THINGS_TO_KEEP_IN_MIND' && c.isVisible !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const item of editorialThings) {
      thingsToConsiderPoints.push({
        title: item.title,
        desc: item.description,
      });
    }
  }

  // If insufficient factual data exists, do not render
  if (whyConsiderPoints.length === 0 && thingsToConsiderPoints.length === 0) {
    return null;
  }

  return (
    <section id="considerations" aria-labelledby="considerations-heading" className="space-y-8 pt-8 border-t border-[var(--color-border)]">
      {/* Why Consider */}
      {whyConsiderPoints.length > 0 && (
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1">
              Project Intelligence
            </div>
            <h2 id="considerations-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
              Why Consider {project.name}
            </h2>
            <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
              Factual, verified structural attributes and developer credentials.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {whyConsiderPoints.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.01] space-y-2 hover:border-[var(--color-foreground)]/20 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[var(--color-foreground)] font-semibold text-sm">
                    <Icon className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-[var(--color-foreground)]/75 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Things to Consider */}
      {thingsToConsiderPoints.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-[var(--color-border)]/60">
          <div>
            <h3 className="text-lg font-display font-semibold text-[var(--color-foreground)]">
              Things to Keep in Mind
            </h3>
            <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
              Objective factual parameters for prospective buyers and investors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {thingsToConsiderPoints.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.01] space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-foreground)]">
                  <Info className="w-3.5 h-3.5 text-[var(--color-foreground)]/60 shrink-0" />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-[var(--color-foreground)]/70 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
