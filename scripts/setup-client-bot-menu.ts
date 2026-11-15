import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  if (!token) {
    console.error('ERROR: TELEGRAM_CLIENT_BOT_TOKEN is not set in environment.');
    process.exit(1);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.alibros.ru';
  const miniappUrl = `${appUrl.replace(/\/$/, '')}/miniapp`;

  console.log(`Configuring @AliBrosClientBot with Mini App URL: ${miniappUrl}`);

  // 1. Check getMe
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  if (!meData.ok) {
    console.error('Failed to getMe:', meData);
    process.exit(1);
  }
  console.log('Bot verified:', meData.result.username, `(id: ${meData.result.id})`);

  // 2. Set Default Global Chat Menu Button
  console.log('\n--- 1. Setting Default Global Menu Button ---');
  const globalMenuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Открыть приложение',
        web_app: {
          url: miniappUrl,
        },
      },
    }),
  });
  const globalMenuData = await globalMenuRes.json();
  console.log('Global setChatMenuButton:', globalMenuData);

  // 3. Set Menu Button for all known users in DB
  console.log('\n--- 2. Setting Per-User Menu Buttons for DB Users ---');
  const accounts = await prisma.telegramAccount.findMany({
    select: { telegramId: true, username: true, firstName: true },
  });
  console.log(`Found ${accounts.length} accounts in database:`);

  for (const acc of accounts) {
    const tgId = Number(acc.telegramId);
    try {
      const userMenuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgId,
          menu_button: {
            type: 'web_app',
            text: 'Открыть приложение',
            web_app: {
              url: miniappUrl,
            },
          },
        }),
      });
      const userMenuData = await userMenuRes.json();
      console.log(`- User @${acc.username || acc.telegramId} (${tgId}):`, userMenuData.ok ? 'OK' : userMenuData.description);
    } catch (err: any) {
      console.error(`- User ${tgId} error:`, err.message);
    }
  }

  // 4. Set Bot Commands
  console.log('\n--- 3. Setting Client Bot Commands ---');
  const commands = [
    { command: 'start', description: 'Запустить бота и открыть кабинет' },
    { command: 'orders', description: 'Мои активные поставки и статус' },
    { command: 'news', description: 'Новости и регламенты AliBros' },
  ];
  const cmdRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  console.log('setMyCommands:', await cmdRes.json());

  // 5. Set Bot Description & Short Description
  console.log('\n--- 4. Setting Bot Description ---');
  const descRes = await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description:
        'Официальный бот AliBros Logistics для клиентов и селлеров маркетплейсов.\n\n' +
        '📱 Нажмите кнопку «Открыть приложение» внизу экрана, чтобы войти в личный кабинет селлера, создать новую поставку и просмотреть актуальные статусы с фотоотчётами.\n\n' +
        'Команды бота:\n' +
        '/start — Главное меню\n' +
        '/orders — Список ваших доставок\n' +
        '/news — Новости и важные регламенты',
    }),
  });
  console.log('setMyDescription:', await descRes.json());

  const shortDescRes = await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      short_description: 'Личный кабинет клиента AliBros: заявки, статусы поставок, фотоотчёты приёмки и сдачи.',
    }),
  });
  console.log('setMyShortDescription:', await shortDescRes.json());

  // 6. Verification
  console.log('\n--- 5. Verification ---');
  for (const acc of accounts) {
    const tgId = Number(acc.telegramId);
    const getRes = await fetch(`https://api.telegram.org/bot${token}/getChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgId }),
    });
    const getData = await getRes.json();
    if (getData.ok) {
      console.log(`User ${acc.username || acc.telegramId}: type=${getData.result?.type}, text="${getData.result?.text}", url=${getData.result?.web_app?.url || 'n/a'}`);
    }
  }

  await prisma.$disconnect();
  console.log('\nSetup completed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
