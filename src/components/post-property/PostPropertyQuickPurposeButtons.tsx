'use client';

import React from 'react';
import type { ListingType } from '@/src/domain/propertySubmission/validation';
import { POST_PROPERTY_PURPOSE_EVENT } from './PostPropertyHeroClient';

export function PostPropertyQuickPurposeButtons() {
  const handleShortcut = (purpose: ListingType) => {
    window.dispatchEvent(new CustomEvent<ListingType>(POST_PROPERTY_PURPOSE_EVENT, { detail: purpose }));
    const formEl = document.getElementById('quick-post-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleShortcut('RESALE')}
        className="px-0 pr-4 sm:px-5 hover:text-[#111111] transition-colors cursor-pointer whitespace-nowrap"
      >
        Sell Property
      </button>
      <button
        type="button"
        onClick={() => handleShortcut('RENTAL')}
        className="px-0 pr-4 sm:px-5 hover:text-[#111111] transition-colors cursor-pointer whitespace-nowrap"
      >
        Rent Property
      </button>
    </>
  );
}
