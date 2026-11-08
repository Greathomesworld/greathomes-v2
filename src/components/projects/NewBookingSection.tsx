import { PublicNewBookingConfigurationDto, ConfigurationAvailabilityStatus } from '@/src/domain/projects/dto/newBookingDto';
import { CheckCircle2, Clock, AlertCircle, XCircle, ShieldCheck } from 'lucide-react';
import { formatIndianPrice } from '@/src/components/discovery/formatters';

interface NewBookingSectionProps {
  configurations: PublicNewBookingConfigurationDto[];
}

function renderAvailabilityBadge(status: ConfigurationAvailabilityStatus) {
  switch (status) {
    case 'AVAILABLE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Available
        </span>
      );
    case 'LIMITED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
          <Clock className="w-3.5 h-3.5" />
          Limited Units
        </span>
      );
    case 'ON_REQUEST':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
          <AlertCircle className="w-3.5 h-3.5" />
          On Request
        </span>
      );
    case 'SOLD_OUT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded bg-red-500/10 text-red-600 border border-red-500/20">
          <XCircle className="w-3.5 h-3.5" />
          Sold Out
        </span>
      );
    case 'NOT_AVAILABLE':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded bg-[var(--color-foreground)]/5 text-[var(--color-foreground)]/60 border border-[var(--color-border)]">
          Not Available
        </span>
      );
  }
}

export function NewBookingSection({ configurations }: NewBookingSectionProps) {
  if (!configurations || configurations.length === 0) return null;

  return (
    <section id="new-booking" aria-labelledby="new-booking-heading" className="space-y-6 pt-10 border-t border-[var(--color-border)]">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1">
            Developer Inventory
          </div>
          <h2 id="new-booking-heading" className="text-2xl md:text-3xl font-display font-semibold text-[var(--color-foreground)]">
            New Booking Availability
          </h2>
          <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
            Developer booking availability verified recently.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {configurations.map(config => (
          <article
            key={config.id}
            id={`booking-${config.id}`}
            className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-6 flex flex-col justify-between space-y-5 hover:border-[var(--color-foreground)]/30 transition-colors shadow-xs"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-display font-semibold text-[var(--color-foreground)]">
                  {config.name}
                </h3>
                {renderAvailabilityBadge(config.availabilityStatus)}
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-foreground)]/50 block mb-0.5">
                  Starting Price
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-display font-bold text-[var(--color-foreground)]">
                    {config.price && config.price > 0 ? formatIndianPrice(config.price) : 'Price on Request'}
                  </span>
                  <span className="text-xs text-[var(--color-foreground)]/60 font-medium">onwards</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-foreground)]/75">
                {config.carpetArea && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-foreground)]/60">Carpet Area:</span>
                    <span className="font-medium">{config.carpetArea} sq.ft.</span>
                  </div>
                )}
                {config.builtUpArea && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-foreground)]/60">Built-Up Area:</span>
                    <span className="font-medium">{config.builtUpArea} sq.ft.</span>
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <span className="text-[var(--color-foreground)]/60">Effective Rate:</span>
                  <span className="text-[var(--color-accent)] font-semibold">
                    ₹{config.effectivePricePerSqft.toLocaleString('en-IN')}/sq.ft.
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
              <div className="inline-flex items-center gap-1 text-[var(--color-foreground)]/60 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-success)]" />
                <span>Verified developer inventory</span>
              </div>

              <span className="text-[11px] text-[var(--color-foreground)]/50">
                Verified recently
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
