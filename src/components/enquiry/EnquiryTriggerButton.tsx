'use client';

import React from 'react';
import { useEnquiry } from './EnquiryContext';
import { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';

interface EnquiryTriggerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  contextData: PublicEnquiryContextDto;
  children: React.ReactNode;
}

export function EnquiryTriggerButton({
  contextData,
  children,
  className = '',
  onClick,
  ...props
}: EnquiryTriggerButtonProps) {
  const { openEnquiry } = useEnquiry();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    openEnquiry(contextData);
    if (onClick) onClick(e);
  };

  return (
    <button type="button" onClick={handleClick} className={className} {...props}>
      {children}
    </button>
  );
}
