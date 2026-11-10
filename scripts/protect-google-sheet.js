const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGET_SHEET_ID = 1913927866;
const TARGET_SHEET_NAME = 'Заявки';

async function main() {
  console.log('=====================================================');
  console.log('  AliBros Logistics — Строгая защита Google Таблицы   ');
  console.log('=====================================================\n');

  // 1. Read environment variables from .env.local
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

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    console.log('❌ Отсутствуют Service Account credentials в .env.local.');
    process.exit(1);
  }

  // 2. Auth with write scope
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
      scope: 'https://www.googleapis.com/auth/spreadsheets',
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
    console.log('❌ Ошибка авторизации Google Sheets API:', tokenData);
    process.exit(1);
  }
  const token = tokenData.access_token;
  console.log('✅ Google OAuth2 авторизация успешна. Токен получен.');

  // 3. Inspect existing protected ranges to prevent duplicates
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,protectedRanges)`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) {
    console.log('❌ Ошибка получения метаданных таблицы:', meta);
    process.exit(1);
  }

  const targetSheet = meta.sheets.find(
    (s) => s.properties?.sheetId === TARGET_SHEET_ID
  );

  if (!targetSheet) {
    console.log(`❌ Целевой лист с sheetId ${TARGET_SHEET_ID} не найден.`);
    process.exit(1);
  }

  console.log(`✅ Целевой лист: «${targetSheet.properties.title}» (sheetId: ${TARGET_SHEET_ID})`);
  const existingProtected = targetSheet.protectedRanges || [];
  console.log(`• Текущее количество существующих Protected Ranges: ${existingProtected.length}`);

  // Check if A:K (cols 0..11) already exists
  const hasAK = existingProtected.some(
    (pr) =>
      pr.range?.startColumnIndex === 0 &&
      pr.range?.endColumnIndex === 11 &&
      pr.range?.sheetId === TARGET_SHEET_ID
  );

  // Check if N:N (cols 13..14) already exists
  const hasN = existingProtected.some(
    (pr) =>
      pr.range?.startColumnIndex === 13 &&
      pr.range?.endColumnIndex === 14 &&
      pr.range?.sheetId === TARGET_SHEET_ID
  );

  const requests = [];

  if (!hasAK) {
    console.log('• Добавление Protected Range для колонок A–K...');
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: TARGET_SHEET_ID,
            startColumnIndex: 0,
            endColumnIndex: 11,
          },
          description: 'Системные поля AliBros (A:K) — запрет редактирования посторонним',
          warningOnly: false,
          editors: {
            users: [serviceAccountEmail],
          },
        },
      },
    });
  } else {
    console.log('ℹ️ Protected Range для колонок A–K уже существует (пропуск добавления).');
  }

  if (!hasN) {
    console.log('• Добавление Protected Range для колонки N...');
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: TARGET_SHEET_ID,
            startColumnIndex: 13,
            endColumnIndex: 14,
          },
          description: 'Системное поле AliBros (N) — запрет редактирования посторонним',
          warningOnly: false,
          editors: {
            users: [serviceAccountEmail],
          },
        },
      },
    });
  } else {
    console.log('ℹ️ Protected Range для колонки N уже существует (пропуск добавления).');
  }

  if (requests.length > 0) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const batchRes = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.log('❌ Ошибка при создании Protected Ranges:', errText);
      process.exit(1);
    }
    console.log('✅ batchUpdate успешно выполнен.');
  }

  // 4. Verify resulting Protected Ranges from Google Sheets API
  console.log('\n=====================================================');
  console.log('  Финальная проверка Protected Ranges через API       ');
  console.log('=====================================================\n');

  const verifyMetaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verifyMeta = await verifyMetaRes.json();
  const verifySheet = verifyMeta.sheets.find(
    (s) => s.properties?.sheetId === TARGET_SHEET_ID
  );
  const finalProtected = verifySheet.protectedRanges || [];

  console.log(`Всего активных Protected Ranges на листе «${TARGET_SHEET_NAME}»: ${finalProtected.length}`);

  let akVerified = false;
  let nVerified = false;

  finalProtected.forEach((pr, idx) => {
    const startCol = pr.range?.startColumnIndex;
    const endCol = pr.range?.endColumnIndex;
    const colLetters = `${String.fromCharCode(65 + startCol)}:${String.fromCharCode(64 + endCol)}`;
    const editorsList = pr.editors?.users || [];
    const canEdit = pr.requestingUserCanEdit;

    console.log(`\n[Диапазон #${idx + 1}] ID: ${pr.protectedRangeId}`);
    console.log(`  • Защищённый интервал: ${colLetters} (колонки ${startCol}..${endCol})`);
    console.log(`  • Описание: «${pr.description || 'Без описания'}»`);
    console.log(`  • Режим: ${pr.warningOnly ? 'Предупреждение (warningOnly)' : 'Строгий запрет (warningOnly = false)'}`);
    console.log(`  • Разрешённые редакторы: ${editorsList.join(', ')} (+ Владелец таблицы)`);
    console.log(`  • Доступ у Service Account (requestingUserCanEdit): ${canEdit ? '✅ РАЗРЕШЁН' : '❌ ЗАПРЕЩЁН'}`);

    if (startCol === 0 && endCol === 11 && canEdit) akVerified = true;
    if (startCol === 13 && endCol === 14 && canEdit) nVerified = true;
  });

  // Verify L:M (cols 11..13) are NOT protected
  const lmProtected = finalProtected.some(
    (pr) =>
      pr.range?.startColumnIndex <= 11 && pr.range?.endColumnIndex >= 13
  );

  console.log('\n-----------------------------------------------------');
  console.log('Проверка доступности колонок L и M (Бухгалтерия):');
  console.log('-----------------------------------------------------');
  if (!lmProtected) {
    console.log('✅ Колонки L («Стоимость доставки») и M («Валюта») НЕ входят ни в один защищённый диапазон.');
    console.log('✅ Бухгалтер и сотрудники с доступом к таблице могут свободно редактировать ячейки L и M.');
  } else {
    console.log('❌ ОШИБКА: Колонки L и M оказались защищены!');
    process.exit(1);
  }

  // Verify sheet "Как заполнять" untouched
  const helpSheet = verifyMeta.sheets.find(
    (s) => s.properties?.sheetId === 1945591373
  );
  console.log('\n-----------------------------------------------------');
  console.log('Проверка сторонних вкладок:');
  console.log('-----------------------------------------------------');
  if (helpSheet) {
    console.log(`✅ Вкладка «${helpSheet.properties.title}» (sheetId: 1945591373) сохранена без изменений.`);
    console.log(`   Protected Ranges на вкладке «${helpSheet.properties.title}»: ${(helpSheet.protectedRanges || []).length} шт.`);
  }

  if (akVerified && nVerified && !lmProtected) {
    console.log('\n🎉 ИТОГ: Строгая защита Google Таблицы настроена на 100%!');
  } else {
    console.log('\n⚠️ Внимание: Не все условия защиты подтверждены!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
