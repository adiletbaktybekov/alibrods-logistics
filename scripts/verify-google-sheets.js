const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXPECTED_HEADERS = [
  'ID заявки',
  'Номер заявки',
  'Дата создания',
  'Компания клиента',
  'Контактное лицо',
  'Телефон',
  'Склад назначения',
  'Дата доставки',
  'Количество коробок',
  'Количество паллет',
  'Текущий статус',
  'Стоимость доставки',
  'Валюта',
  'Дата последнего обновления',
];

function maskString(str, startVisible = 4, endVisible = 4) {
  if (!str) return 'MISSING';
  if (str.length <= startVisible + endVisible) return '***';
  return str.slice(0, startVisible) + '...' + str.slice(-endVisible);
}

function maskEmail(email) {
  if (!email) return 'MISSING';
  const parts = email.split('@');
  if (parts.length !== 2) return maskString(email);
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 3 ? name.slice(0, 3) + '***' : '***';
  return `${maskedName}@${domain}`;
}

async function inspectPublicSheet(spreadsheetId, sheetName, targetGid) {
  console.log('\n2. Публичный аудит Google Таблицы (Read-Only):');
  console.log('--------------------------------------------------');

  try {
    const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
    const htmlRes = await fetch(htmlUrl, { redirect: 'follow' });
    const html = await htmlRes.text();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    let docTitle = titleMatch ? titleMatch[1].replace(' - Google Диск', '').replace(' - Google Drive', '').trim() : 'AliBros Logistics';

    console.log(`✅ Документ доступен: «${docTitle}»`);

    // Parse tabs
    const tabRegex = /items\.push\(\{\s*name:\s*\"([^\"]+)\"[^}]+gid:\s*\"([^\"]+)\"/g;
    const tabs = [];
    let match;
    while ((match = tabRegex.exec(html)) !== null) {
      tabs.push({ title: match[1], gid: match[2] });
    }

    console.log('   Обнаруженные вкладки в документе:');
    tabs.forEach(t => {
      const isTarget = (targetGid && t.gid === targetGid) || t.title.toLowerCase() === sheetName.toLowerCase();
      console.log(`   - «${t.title}» (sheetId / gid: ${t.gid}) ${isTarget ? '👈 ЦЕЛЕВАЯ ВКЛАДКА' : ''}`);
    });

    // Check target tab
    const effectiveGid = targetGid || tabs.find(t => t.title.toLowerCase() === sheetName.toLowerCase())?.gid || '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${effectiveGid}`;
    const csvRes = await fetch(csvUrl, { redirect: 'follow' });

    if (csvRes.ok) {
      const csvText = await csvRes.text();
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      const rowCount = lines.length;

      console.log(`\n3. Анализ структуры вкладки «${sheetName}» (gid: ${effectiveGid}):`);
      console.log('--------------------------------------------------');
      console.log(`• Всего строк с данными: ${rowCount > 1 ? rowCount - 1 : 0}`);

      if (rowCount >= 1) {
        // Parse CSV headers safely
        const rawHeaders = lines[0];
        // Split handling quotes
        const headers = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < rawHeaders.length; i++) {
          const char = rawHeaders[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            headers.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        headers.push(cur.trim());

        console.log(`• Количество текущих колонок: ${headers.length}`);
        console.log('• Текущие заголовки в таблице:');
        headers.forEach((h, idx) => {
          const letter = String.fromCharCode(65 + idx);
          console.log(`   [${letter}] ${h}`);
        });

        console.log('\n4. Сравнение с эталонной структурой (14 колонок):');
        console.log('--------------------------------------------------');
        let mismatches = false;
        for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
          const letter = String.fromCharCode(65 + i);
          const exp = EXPECTED_HEADERS[i];
          const act = headers[i] || '';
          const ok = exp.toLowerCase() === act.toLowerCase();
          if (!ok) mismatches = true;
          console.log(`   Колонка ${letter.padEnd(2)} (${String(i + 1).padStart(2)}): Ожидается «${exp}» | Сейчас «${act || 'ОТСУТСТВУЕТ'}» -> ${ok ? '✅ OK' : '⚠️ ТРЕБУЕТ ОБНОВЛЕНИЯ'}`);
        }

        if (rowCount <= 1) {
          console.log('\n🛡️ БЕЗОПАСНОСТЬ ДАННЫХ: Таблица не содержит строк с данными (0 строк).');
          console.log('   Риск потери информации = 0%. Приведение к 14 колонкам полностью безопасно.');
        } else {
          console.log(`\n⚠️ В таблице есть существующие строки (${rowCount - 1} шт.). Потребуется бережное сопоставление.`);
        }
      }
    }
  } catch (err) {
    console.log('Ошибка публичного аудита:', err.message);
  }
}

async function main() {
  console.log('=====================================================');
  console.log('  AliBros Logistics — Google Sheets Read-Only Audit  ');
  console.log('=====================================================\n');

  // 1. Read environment variables from process.env and .env.local
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const localEnv = {};

  if (fs.existsSync(envLocalPath)) {
    const raw = fs.readFileSync(envLocalPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const k = trimmed.split('=')[0].trim();
        let v = trimmed.slice(trimmed.indexOf('=') + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        localEnv[k] = v;
      }
    }
  }

  const serviceAccountEmail = localEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = localEnv.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = localEnv.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = localEnv.GOOGLE_SHEETS_SHEET_NAME || process.env.GOOGLE_SHEETS_SHEET_NAME || 'Заявки';
  const targetSheetId = localEnv.GOOGLE_SHEETS_SHEET_ID || process.env.GOOGLE_SHEETS_SHEET_ID || '1913927866';

  console.log('1. Проверка конфигурации окружения (.env.local / env):');
  console.log('-----------------------------------------------------');
  console.log(`• GOOGLE_SHEETS_SPREADSHEET_ID: ${spreadsheetId ? `[OK] (${spreadsheetId})` : '[MISSING] Не задан'}`);
  console.log(`• GOOGLE_SHEETS_SHEET_NAME:     ${sheetName} (целевая вкладка)`);
  console.log(`• GOOGLE_SHEETS_SHEET_ID:       ${targetSheetId} (целевой gid)`);
  console.log(`• GOOGLE_SERVICE_ACCOUNT_EMAIL: ${serviceAccountEmail ? `[OK] (${maskEmail(serviceAccountEmail)})` : '[MISSING] Ожидает настройки'}`);
  console.log(`• GOOGLE_PRIVATE_KEY:           ${privateKey ? `[OK] (Длина: ${privateKey.length} символов, RSA PEM)` : '[MISSING] Ожидает настройки'}\n`);

  if (!serviceAccountEmail || !privateKey) {
    if (spreadsheetId) {
      await inspectPublicSheet(spreadsheetId, sheetName, targetSheetId);
    }

    console.log('\n-----------------------------------------------------');
    console.log('⚠️ ДЛЯ АКТИВАЦИИ API И ЗАВЕРШЕНИЯ ПОДКЛЮЧЕНИЯ:');
    console.log('1. Создайте Google Cloud Service Account и скачайте JSON-ключ.');
    console.log(`2. Добавьте email сервисного аккаунта в Google Таблицу как «Редактор» (Editor).`);
    console.log('3. Пропишите в .env.local:');
    console.log('   GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@...iam.gserviceaccount.com"');
    console.log('   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
    console.log('4. Запустите: npm run sheets\n');
    return;
  }

  // 2. Authorization: Request Google OAuth2 Access Token
  console.log('2. Проверка авторизации Service Account:');
  console.log('----------------------------------------');

  let accessToken = null;
  try {
    let key = privateKey.trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.slice(1, -1);
    }
    const formattedKey = key.replace(/\\n/g, '\n').trim();

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(formattedKey, 'base64url');
    const assertion = `${header}.${payload}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.log(`❌ Ошибка авторизации в Google OAuth2 (HTTP ${tokenRes.status}):`, tokenData.error_description || tokenData.error || tokenData);
      process.exit(1);
    }

    accessToken = tokenData.access_token;
    console.log('✅ Google Service Account успешно авторизован! Токен доступа получен.\n');
  } catch (authErr) {
    console.log('❌ Исключение при авторизации:', authErr.message);
    process.exit(1);
  }

  // 3. Check Spreadsheet Access & Structure
  console.log('3. Проверка доступа к Google Таблице:');
  console.log('------------------------------------');

  let spreadsheetMeta = null;
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      console.log(`❌ Ошибка доступа к таблице (HTTP ${metaRes.status}):`, metaData.error?.message || metaData);
      process.exit(1);
    }

    spreadsheetMeta = metaData;
    console.log(`✅ Доступ к таблице подтверждён! Название: «${spreadsheetMeta.properties?.title || 'Без названия'}»`);
  } catch (err) {
    console.log('❌ Ошибка сети при запросе метаданных таблицы:', err.message);
    process.exit(1);
  }

  // 4. Check sheet tab exists
  console.log('\n4. Проверка наличия целевого листа:');
  console.log('----------------------------------');

  const sheetsList = spreadsheetMeta.sheets || [];
  const foundSheet = sheetsList.find(
    (s) =>
      String(s.properties?.sheetId) === String(targetSheetId) ||
      s.properties?.title?.toLowerCase() === sheetName.toLowerCase()
  );

  if (!foundSheet) {
    console.log(`❌ Лист с названием «${sheetName}» или sheetId ${targetSheetId} не найден.`);
    process.exit(1);
  }

  const actualSheetTitle = foundSheet.properties.title;
  const actualSheetId = foundSheet.properties.sheetId;
  console.log(`✅ Целевой лист найден: «${actualSheetTitle}» (sheetId: ${actualSheetId}).`);
  if (String(actualSheetId) === String(targetSheetId)) {
    console.log(`🎯 sheetId ${actualSheetId} в точности соответствует gid=${targetSheetId}!`);
  }

  // 5. Check 14-columns headers in row 1
  console.log('\n5. Проверка структуры заголовков (14 колонок):');
  console.log('----------------------------------------------');

  try {
    const range = encodeURIComponent(`${actualSheetTitle}!A1:N1`);
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const valuesRes = await fetch(valuesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const valuesData = await valuesRes.json();
    const rows = valuesData.values || [];

    if (rows.length === 0 || !rows[0] || rows[0].length === 0) {
      console.log('ℹ️ Лист пуст.');
      return;
    }

    const actualHeaders = rows[0].map((h) => (h ? String(h).trim() : ''));
    let hasMismatches = false;

    console.log('Сравнение фактических заголовков с эталонными:');
    for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
      const colLetter = String.fromCharCode(65 + i);
      const expected = EXPECTED_HEADERS[i];
      const actual = actualHeaders[i] || '';

      const match = actual.toLowerCase() === expected.toLowerCase();
      if (!match) hasMismatches = true;

      const mark = match ? '✅ OK' : '❌ МИСМАТЧ';
      console.log(`  Колонка ${colLetter.padEnd(2)} (${String(i + 1).padStart(2)}): Ожидается «${expected}» | Фактически «${actual || 'ПУСТО'}» -> ${mark}`);
    }

    if (hasMismatches) {
      console.log('\n⚠️ ВНИМАНИЕ: Названия или порядок колонок отличаются от эталонных!');
      console.log('Запустите npm run sheets:setup для автоматического приведения к 14 колонкам.');
    } else {
      console.log('\n🎉 ИТОГ: Все 14 колонок строго соответствуют спецификации AliBros Logistics!');
      console.log('Интеграция готова к безопасной двусторонней синхронизации.');
    }
  } catch (valErr) {
    console.log('❌ Ошибка при чтении строки заголовков:', valErr.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Непредвиденная ошибка:', err);
  process.exit(1);
});
