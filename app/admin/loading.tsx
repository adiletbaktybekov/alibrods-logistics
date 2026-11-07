import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="h-8 w-64 bg-slate-200 rounded-md" />
          <div className="h-4 w-96 bg-slate-100 rounded-md mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-slate-100 rounded-md" />
          <div className="h-8 w-24 bg-slate-200 rounded-md" />
        </div>
      </div>

      {/* KPI Cards Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="border border-slate-200 bg-white shadow-xs h-28">
            <CardHeader className="pb-1 pt-4 px-4">
              <div className="h-3 w-20 bg-slate-200 rounded" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-7 w-16 bg-slate-200 rounded mt-1" />
              <div className="h-2 w-28 bg-slate-100 rounded mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics Section Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 bg-white shadow-xs h-64 p-6">
          <div className="h-5 w-56 bg-slate-200 rounded mb-4" />
          <div className="h-40 bg-slate-100 rounded-lg" />
        </Card>
        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-xs h-32 p-4">
            <div className="h-4 w-36 bg-slate-200 rounded mb-3" />
            <div className="h-4 w-full bg-slate-100 rounded-full" />
          </Card>
          <Card className="border-slate-200 bg-white shadow-xs h-28 p-4">
            <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-2 w-full bg-slate-100 rounded" />
              <div className="h-2 w-3/4 bg-slate-100 rounded" />
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Orders Skeleton */}
      <Card className="border-slate-200 bg-white shadow-xs h-64 p-6">
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
