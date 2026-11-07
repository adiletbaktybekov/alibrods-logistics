import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export default function AdminWarehousesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="h-8 w-64 bg-slate-200 rounded-md" />
          <div className="h-4 w-96 bg-slate-100 rounded-md mt-2" />
        </div>
        <div className="h-6 w-48 bg-slate-100 rounded-full" />
      </div>

      {/* Info Callout Skeleton */}
      <div className="h-16 w-full bg-blue-50/50 rounded-xl border border-blue-100" />

      {/* Warehouse Groups Skeletons */}
      {[1, 2, 3].map((group) => (
        <Card key={group} className="border-slate-200 bg-white shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <div className="h-5 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-64 bg-slate-100 rounded" />
            </div>
            <div className="h-5 w-20 bg-slate-100 rounded-full" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((card) => (
                <div
                  key={card}
                  className="rounded-xl border border-slate-200 p-4 bg-slate-50/40 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-24 bg-slate-200 rounded" />
                    <div className="h-4 w-12 bg-slate-100 rounded" />
                  </div>
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                  <div className="pt-3 border-t border-slate-100 flex justify-between">
                    <div className="h-3 w-12 bg-slate-100 rounded" />
                    <div className="h-3 w-24 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
