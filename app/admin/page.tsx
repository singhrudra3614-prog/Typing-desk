'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AdminPanel from '@/components/AdminPanel';

export default function AdminRoutePage() {
  const router = useRouter();
  return <AdminPanel onExit={() => router.push('/')} />;
}
