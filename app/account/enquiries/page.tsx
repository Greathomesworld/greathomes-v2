import React from 'react';
import { Metadata } from 'next';
import CustomerEnquiriesView from '@/src/components/account/CustomerEnquiriesView';

export const metadata: Metadata = {
  title: 'My Enquiries | Great Homes',
  description: 'View and track your submitted property enquiries with Great Homes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CustomerEnquiriesPage() {
  return <CustomerEnquiriesView />;
}
