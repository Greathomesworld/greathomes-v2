'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminReraRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/intelligence/rera');
  }, [router]);

  return null;
}
