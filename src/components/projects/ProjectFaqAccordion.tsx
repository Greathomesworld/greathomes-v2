'use client';

import { useState, useEffect } from 'react';
import { PublicProjectFaqDto } from '@/src/domain/projects/dto/projectDto';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface ProjectFaqAccordionProps {
  faqs: PublicProjectFaqDto[];
}

export function ProjectFaqAccordion({ faqs }: ProjectFaqAccordionProps) {
  const firstFaqId = faqs?.[0]?.id || null;
  const [openId, setOpenId] = useState<string | null>(firstFaqId);

  useEffect(() => {
    setOpenId(firstFaqId);
  }, [firstFaqId]);

  if (!faqs || faqs.length === 0) return null;

  const toggleFaq = (id: string) => {
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <section id="faq" aria-labelledby="project-faqs-heading" className="space-y-6 pt-6 border-t border-[var(--color-border)]">
      <div>
        <h2 id="project-faqs-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
          Frequently Asked Questions
        </h2>
        <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
          Essential guidance and answers regarding pricing, possession, and legal documentation.
        </p>
      </div>

      <div className="space-y-3 max-w-4xl">
        {faqs.map(faq => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.01] overflow-hidden transition-colors"
            >
              <button
                onClick={() => toggleFaq(faq.id)}
                aria-expanded={isOpen}
                className="w-full text-left p-4 md:p-5 flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold text-[var(--color-foreground)]">
                    {faq.question}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--color-foreground)]/50 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'transform rotate-180' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 md:px-5 md:pb-5 pt-0 pl-11 text-xs md:text-sm text-[var(--color-foreground)]/75 leading-relaxed border-t border-[var(--color-border)]/50">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
