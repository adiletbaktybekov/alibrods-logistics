import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/database/prisma';
import { getCurrentUser } from '@/app/actions/auth';
import { getFileStorageProvider } from '@/modules/storage/storage.service';
import { UserRole } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id: orderId, photoId } = await params;

  // 1. Authenticate user session
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  }

  // 2. Fetch order and photo
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      client: true,
      assignments: {
        include: { driver: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  const photo = await prisma.orderPhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo || photo.orderId !== order.id) {
    return NextResponse.json({ error: 'Фотоотчёт не найден' }, { status: 404 });
  }

  // 3. Strict RBAC & IDOR checks
  const privilegedRoles: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
  ];

  if (!privilegedRoles.includes(user.role)) {
    if (user.role === UserRole.CLIENT) {
      if (order.client?.userId !== user.id) {
        return NextResponse.json(
          { error: 'Доступ запрещён: разрешён просмотр фото только своих заявок' },
          { status: 403 }
        );
      }
    } else if (user.role === UserRole.DRIVER) {
      const isAssigned = order.assignments.some((a) => a.driver?.userId === user.id);
      if (!isAssigned) {
        return NextResponse.json(
          { error: 'Доступ запрещён: водитель может просматривать фото только назначенных заявок' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }
  }

  // 4. File delivery from private S3 bucket
  const storage = getFileStorageProvider();
  const fileKey = photo.fileKey || photo.photoUrl;

  if (storage.isConfigured() && fileKey) {
    const signedUrl = await storage.getSignedDownloadUrl(fileKey, 900); // 15 min TTL
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, {
        status: 307,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      });
    }
  }

  // Fallback for development / unconfigured cloud: safe informative SVG placeholder
  const categoryLabel = photo.type === 'CARGO_PICKUP' ? 'Приёмка груза' : 'Сдача на склад';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="none">
    <rect width="600" height="400" fill="#F8FAFC"/>
    <rect x="20" y="20" width="560" height="360" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    <circle cx="300" cy="140" r="44" fill="#EEF2FF"/>
    <path d="M284 156L294 142L304 152L316 136L324 156H284Z" fill="#4F46E5"/>
    <circle cx="316" cy="130" r="4" fill="#4F46E5"/>
    <text x="300" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#0F172A" text-anchor="middle">Фотоотчёт: ${categoryLabel}</text>
    <text x="300" y="248" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#64748B" text-anchor="middle">Заказ ${order.orderNumber} • ${photo.mimeType || 'image/jpeg'}</text>
    <text x="300" y="278" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#94A3B8" text-anchor="middle">S3-хранилище в режиме ожидания боевых ключей</text>
  </svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
