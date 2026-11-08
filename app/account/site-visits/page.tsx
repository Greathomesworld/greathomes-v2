import React from 'react';
import { Metadata } from 'next';
import CustomerSiteVisitsView from '@/src/components/account/CustomerSiteVisitsView';

export const metadata: Metadata = {
  title: 'My Site Visits | Great Homes',
  description: 'Manage and schedule your property site visits with Great Homes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CustomerSiteVisitsPage() {
  return <CustomerSiteVisitsView />;
}
