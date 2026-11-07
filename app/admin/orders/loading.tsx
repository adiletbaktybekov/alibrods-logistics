import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export default function AdminOrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="h-8 w-48 bg-slate-200 rounded-md" />
          <div className="h-4 w-40 bg-slate-100 rounded-md mt-2" />
        </div>
        <div className="h-8 w-32 bg-slate-100 rounded-lg" />
      </div>

      {/* Filter Bar Skeleton */}
      <Card className="p-4 border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((col) => (
            <div key={col} className="space-y-1.5">
              <div className="h-3.5 w-24 bg-slate-200 rounded" />
              <div className="h-9 w-full bg-slate-100 rounded-lg border border-slate-200" />
            </div>
          ))}
        </div>
      </Card>

      {/* Table Skeleton */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><div className="h-3.5 w-16 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-28 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-20 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-14 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-24 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-20 bg-slate-200 rounded" /></TableHead>
                <TableHead><div className="h-3.5 w-16 bg-slate-200 rounded" /></TableHead>
                <TableHead className="text-right"><div className="h-3.5 w-16 bg-slate-200 rounded ml-auto" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6].map((row) => (
                <TableRow key={row} className="hover:bg-slate-50/80">
                  <TableCell>
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                    <div className="h-2.5 w-16 bg-slate-100 rounded mt-1.5" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="h-2.5 w-24 bg-slate-100 rounded mt-1.5" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-slate-200 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-5 w-14 bg-slate-100 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-slate-100 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-5 w-20 bg-slate-100 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="h-7 w-20 bg-slate-100 rounded-md ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          <div className="h-3.5 w-44 bg-slate-200 rounded" />
          <div className="flex items-center gap-3">
            <div className="h-3.5 w-28 bg-slate-200 rounded" />
            <div className="flex items-center gap-1.5">
              <div className="h-8 w-24 bg-slate-200 rounded-lg" />
              <div className="h-8 w-24 bg-slate-200 rounded-lg" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
