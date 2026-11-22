import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isProductionDeployment } from '@/src/lib/config';
import CompressionGalleryClient from './CompressionGalleryClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Internal Media Compression Gallery | Great Homes',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CompressionGalleryPage() {
  if (isProductionDeployment()) {
    notFound();
  }
  return <CompressionGalleryClient />;
}
