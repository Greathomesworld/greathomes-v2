import React from 'react';
import { Metadata } from 'next';
import AdminSiteVisitsView from '@/src/components/admin/AdminSiteVisitsView';

export const metadata: Metadata = {
  title: 'Site Visit Operations | Great Homes Admin',
  description: 'Manage and coordinate customer property inspection site visits.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSiteVisitsPage() {
  return <AdminSiteVisitsView />;
}
