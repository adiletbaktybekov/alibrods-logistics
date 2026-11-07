import * as React from 'react';
import { redirect } from 'next/navigation';
import { getAdminDashboardStatsAction } from '@/app/actions/admin';
import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let stats;
  try {
    stats = await getAdminDashboardStatsAction();
  } catch {
    redirect('/login');
  }

  return <DashboardClient initialStats={stats} />;
}
