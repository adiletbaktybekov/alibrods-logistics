import { redirect } from 'next/navigation';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { ClientHeader } from '@/components/navigation/client-header';

export const dynamic = 'force-dynamic';

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentClientProfile();

  if (!profile || !profile.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      <ClientHeader user={profile.user} client={profile.client} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        AliBros Logistics © {new Date().getFullYear()} — Платформа доставки на склады маркетплейсов
      </footer>
    </div>
  );
}
