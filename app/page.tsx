import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
