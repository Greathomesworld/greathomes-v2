'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

export const POST_PROPERTY_TRUST_MESSAGES = [
  'Verified listings & serious enquiries',
  'Simple, guided submission',
  'Your data stays private and secure',
] as const;

export const TRUST_TICKER_INTERVAL_MS = 1000;
export const TRUST_TICKER_TRANSITION_SECONDS = 0.22;

/**
 * Compact mobile trust-message strip for /post-property.
 * Displays one message at a time with continuous vertical upward motion
 * at a 1000ms (1s) interval and 220ms transition duration.
 */
export function PostPropertyTrustTicker() {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timerId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % POST_PROPERTY_TRUST_MESSAGES.length);
    }, TRUST_TICKER_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [prefersReducedMotion]);

  return (
    <div className="w-full">
      {/* Static screen-reader copy so assistive tech reads all three trust points once without rapid announcements */}
      <ul className="sr-only">
        {POST_PROPERTY_TRUST_MESSAGES.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>

      {prefersReducedMotion ? (
        <div
          aria-hidden="true"
          className="flex flex-col items-center space-y-1 py-1"
        >
          {POST_PROPERTY_TRUST_MESSAGES.map((message) => (
            <div
              key={message}
              className="flex items-center justify-center gap-2 font-body text-[13px] font-medium text-[#333333]"
            >
              <Check
                className="h-3.5 w-3.5 shrink-0 text-[#E85D3F]"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span className="truncate">{message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="relative h-8 w-full overflow-hidden"
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={activeIndex}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{
                duration: TRUST_TICKER_TRANSITION_SECONDS,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-0 flex items-center justify-center gap-2 px-1 font-body text-[13px] font-medium text-[#333333]"
            >
              <Check
                className="h-3.5 w-3.5 shrink-0 text-[#E85D3F]"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span className="truncate">{POST_PROPERTY_TRUST_MESSAGES[activeIndex]}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
