'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';
import { useSearch } from '@/src/context/SearchContext';

const GreatHomesEnquiryDialog = dynamic(
  () =>
    import('@/src/components/enquiry/GreatHomesEnquiryDialog').then(
      (mod) => mod.GreatHomesEnquiryDialog
    ),
  { ssr: false }
);

const CustomerAuthModal = dynamic(
  () =>
    import('@/src/components/customer/CustomerAuthModal').then(
      (mod) => mod.CustomerAuthModal
    ),
  { ssr: false }
);

const ImmersiveSearchModal = dynamic(
  () =>
    import('@/src/components/search/ImmersiveSearchModal').then(
      (mod) => mod.ImmersiveSearchModal
    ),
  { ssr: false }
);

/**
 * Defers downloading and hydrating heavy global modals (Enquiry, Customer OTP Auth,
 * and Immersive Search) until the user actually triggers one of them.
 * Once opened, each modal stays latched so close animations remain smooth.
 */
export function GlobalModalsHost() {
  const { isOpen: isEnquiryOpen } = useEnquiry();
  const { isAuthModalOpen } = useCustomerAuth();
  const { isSearchModalOpen } = useSearch();

  const [hasMountedEnquiry, setHasMountedEnquiry] = useState(false);
  const [hasMountedAuth, setHasMountedAuth] = useState(false);
  const [hasMountedSearch, setHasMountedSearch] = useState(false);

  useEffect(() => {
    if (isEnquiryOpen) setHasMountedEnquiry(true);
  }, [isEnquiryOpen]);

  useEffect(() => {
    if (isAuthModalOpen) setHasMountedAuth(true);
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (isSearchModalOpen) setHasMountedSearch(true);
  }, [isSearchModalOpen]);

  return (
    <>
      {(isEnquiryOpen || hasMountedEnquiry) && <GreatHomesEnquiryDialog />}
      {(isAuthModalOpen || hasMountedAuth) && <CustomerAuthModal />}
      {(isSearchModalOpen || hasMountedSearch) && <ImmersiveSearchModal />}
    </>
  );
}
