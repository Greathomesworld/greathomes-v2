'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PostPropertyFaqItem } from './postPropertyFaqData';

interface PostPropertyFaqAccordionProps {
  faqs: PostPropertyFaqItem[];
}

export function PostPropertyFaqAccordion({ faqs }: PostPropertyFaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!faqs || faqs.length === 0) return null;

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-3">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        const panelId = `post-property-faq-panel-${faq.id}`;
        const buttonId = `post-property-faq-trigger-${faq.id}`;

        return (
          <div
            key={faq.id}
            className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden transition-colors hover:border-[#C5BFB7]"
          >
            <button
              id={buttonId}
              type="button"
              onClick={() => toggle(faq.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="w-full min-h-[52px] px-5 py-4 text-left flex items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]/60 cursor-pointer"
            >
              <span className="font-display text-sm sm:text-[15px] font-semibold text-[#111111] leading-snug">
                {faq.question}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#6E6A65] transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-[#E85D3F]' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="border-t border-[#F0EDE8] px-5 pb-4 pt-3 text-xs sm:text-sm leading-relaxed text-[#555555] font-body"
              >
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
