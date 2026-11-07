import * as React from 'react';
import { Card } from '@/components/ui/card';

export default function GoogleSheetsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-40 bg-slate-200 rounded" />
        <div className="h-8 w-72 bg-slate-200 rounded-md" />
        <div className="h-4 w-96 bg-slate-100 rounded" />
      </div>

      {/* KPI Status Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-slate-200 bg-white shadow-xs p-4 h-24">
            <div className="h-3 w-28 bg-slate-200 rounded mb-3" />
            <div className="h-6 w-36 bg-slate-200 rounded" />
          </Card>
        ))}
      </div>

      {/* Sync Control Card Skeleton */}
      <Card className="border-slate-200 bg-white shadow-xs p-6 h-40">
        <div className="h-5 w-48 bg-slate-200 rounded mb-4" />
        <div className="h-10 bg-slate-100 rounded-lg" />
      </Card>

      {/* Table Skeleton */}
      <Card className="border-slate-200 bg-white shadow-xs p-6 h-64">
        <div className="h-5 w-48 bg-slate-200 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 rounded" />
          ))}
        </div>
      </Card>
    </div>
  );
}
