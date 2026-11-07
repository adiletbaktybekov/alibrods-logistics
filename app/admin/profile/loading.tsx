import * as React from 'react';
import { Card } from '@/components/ui/card';

export default function AdminProfileLoading() {
  return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      {/* Header Skeleton */}
      <div className="pb-2 border-b border-slate-200 space-y-2">
        <div className="h-8 w-56 bg-slate-200 rounded-md" />
        <div className="h-4 w-80 bg-slate-100 rounded" />
      </div>

      {/* Account Info Card Skeleton */}
      <Card className="border-slate-200 bg-white shadow-xs p-6 space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 bg-slate-100 rounded" />
              <div className="h-5 w-48 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </Card>

      {/* Password Form Card Skeleton */}
      <Card className="border-slate-200 bg-white shadow-xs p-6 space-y-4">
        <div className="h-5 w-44 bg-slate-200 rounded" />
        <div className="space-y-3">
          <div className="h-10 bg-slate-100 rounded-md" />
          <div className="h-10 bg-slate-100 rounded-md" />
          <div className="h-10 bg-slate-100 rounded-md" />
        </div>
      </Card>
    </div>
  );
}
