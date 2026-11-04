import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { siteConfig } from '@/config/site';

export default function HomePage() {
  const domains = [
    { name: 'Auth & Identity', desc: 'Argon2id, Jose JWT, Telegram WebApp HMAC validation' },
    { name: 'Role-Based Access (RBAC)', desc: 'Server-side enforcement across 6 roles, IDOR protection' },
    { name: 'Orders & Cargo Items', desc: 'WB/Ozon fulfillment, volumetric metrics, unique ABL tracking' },
    { name: 'Warehouses & Hubs', desc: 'Destination registry for Wildberries and Ozon' },
    { name: 'Driver Operations', desc: 'Telegram Bot architecture, dispatch & photo reports' },
    { name: 'Structured Observability', desc: 'Pino structured logging, immutable audit log' },
  ];

  return (
    <main className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <header className="mb-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Badge variant="default">Phase 1: Foundation Ready</Badge>
          <Badge variant="success">Next.js 15 App Router</Badge>
          <Badge variant="outline">Prisma ORM 6</Badge>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          {siteConfig.description}
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Архитектурный фундамент модульного монолита</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {domains.map((domain) => (
            <Card key={domain.name} className="hover:border-brand-300 transition-colors">
              <CardHeader>
                <CardTitle className="text-base text-brand-900">{domain.name}</CardTitle>
                <CardDescription>{domain.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Статус системы</h3>
        <p className="text-sm text-slate-600 mb-4">
          Базовые интерфейсы API, система валидации Zod, сервисные слои и сущности базы данных инициализированы в соответствии с требованиями промышленного стандарта.
        </p>
        <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-500">
          <div><span className="font-semibold text-slate-700">Health API:</span> /api/health</div>
          <div><span className="font-semibold text-slate-700">OpenAPI Spec:</span> /api/v1/openapi</div>
        </div>
      </section>
    </main>
  );
}
