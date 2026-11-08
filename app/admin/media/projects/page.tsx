'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminMediaProjectsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/intelligence/media');
  }, [router]);

  return null;
}
