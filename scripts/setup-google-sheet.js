const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TARGET_SHEET_ID = 1913927866;
const TARGET_SHEET_NAME = 'Заявки';

const HEADERS_14 = [
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

const COLUMN_WIDTHS_PX = [
  140, // A: ID заявки
  130, // B: Номер заявки
  150, // C: Дата создания
  200, // D: Компания клиента
  170, // E: Контактное лицо
  150, // F: Телефон
  180, // G: Склад назначения
  130, // H: Дата доставки
  110, // I: Количество коробок
  110, // J: Количество паллет
  160, // K: Текущий статус
  160, // L: Стоимость доставки (Бухгалтер)
  90,  // M: Валюта (Бухгалтер)
  170, // N: Дата последнего обновления
];

async function main() {
  console.log('=====================================================');
  console.log('  AliBros Logistics — Приведение Google Таблицы       ');
  console.log('=====================================================\n');

  // 1. Read env
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
    console.log('❌ Настройка невозможна: отсутствуют Service Account credentials в .env.local.');
    console.log('Необходимо указать:');
    console.log('  GOOGLE_SERVICE_ACCOUNT_EMAIL');
    console.log('  GOOGLE_PRIVATE_KEY');
    console.log('  GOOGLE_SHEETS_SPREADSHEET_ID');
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
  console.log('✅ Авторизация успешна. Права на редактирование получены.');

  // 3. Inspect metadata
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) {
    console.log('❌ Ошибка получения метаданных таблицы:', meta);
    process.exit(1);
  }

  console.log(`✅ Таблица: «${meta.properties?.title}»`);

  const sheets = meta.sheets || [];
  const targetSheet = sheets.find(
    (s) =>
      s.properties?.sheetId === TARGET_SHEET_ID ||
      s.properties?.title?.toLowerCase() === TARGET_SHEET_NAME.toLowerCase()
  );

  if (!targetSheet) {
    console.log(`❌ Вкладка с sheetId ${TARGET_SHEET_ID} не найдена.`);
    process.exit(1);
  }

  const effectiveSheetId = targetSheet.properties.sheetId;
  const effectiveTitle = targetSheet.properties.title;
  console.log(`✅ Целевая вкладка: «${effectiveTitle}» (sheetId: ${effectiveSheetId})`);

  // 4. Check existing rows
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveTitle)}!A:N`;
  const readRes = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const readData = await readRes.json();
  const existingRows = readData.values || [];
  const rowCount = existingRows.length;

  console.log(`• Всего строк в листе: ${rowCount}`);
  if (rowCount > 1) {
    console.log(`⚠️ ВНИМАНИЕ: В листе найдено ${rowCount - 1} строк данных. Строки с данными не будут удалены.`);
  } else {
    console.log('• Данных нет (только заголовки или пустой лист). Переоформление абсолютно безопасно.');
  }

  // 5. Update Headers in Row 1
  const updateHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveTitle)}!A1:N1?valueInputOption=USER_ENTERED`;
  const updateHeadersRes = await fetch(updateHeadersUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [HEADERS_14],
    }),
  });

  if (!updateHeadersRes.ok) {
    console.log('❌ Не удалось обновить заголовки:', await updateHeadersRes.text());
    process.exit(1);
  }
  console.log('✅ Заголовки строки 1 успешно обновлены на 14 эталонных колонок.');

  // 6. Format and Polish via BatchUpdate
  const batchRequests = [];

  // A. Rename sheet to 'Заявки' if needed
  if (effectiveTitle !== TARGET_SHEET_NAME) {
    batchRequests.push({
      updateSheetProperties: {
        properties: {
          sheetId: effectiveSheetId,
          title: TARGET_SHEET_NAME,
        },
        fields: 'title',
      },
    });
  }

  // B. Freeze Row 1
  batchRequests.push({
    updateSheetProperties: {
      properties: {
        sheetId: effectiveSheetId,
        gridProperties: {
          frozenRowCount: 1,
        },
      },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // C. Set Column Widths (A:N)
  COLUMN_WIDTHS_PX.forEach((pixelSize, colIndex) => {
    batchRequests.push({
      updateDimensionProperties: {
        range: {
          sheetId: effectiveSheetId,
          dimension: 'COLUMNS',
          startIndex: colIndex,
          endIndex: colIndex + 1,
        },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    });
  });

  // D. Format Header Row Style: Dark Slate theme, bold white text
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 14,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.059, green: 0.09, blue: 0.165 }, // #0f172a
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          textFormat: {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
            fontSize: 10,
          },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    },
  });

  // E. Highlight Columns L & M (Стоимость и Валюта - для бухгалтера) with distinctive Emerald accent
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 11, // Column L
        endColumnIndex: 13,   // Column M (exclusive)
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.024, green: 0.306, blue: 0.231 }, // #064e3b deep emerald
          textFormat: {
            foregroundColor: { red: 0.82, green: 0.98, blue: 0.88 }, // soft mint
            bold: true,
            fontSize: 10,
          },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  });

  // F. Filter handling: clear previous filter if exists, then set on A1:N
  if (targetSheet.basicFilter) {
    batchRequests.push({
      clearBasicFilter: {
        sheetId: effectiveSheetId,
      },
    });
  }

  batchRequests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId: effectiveSheetId,
          startRowIndex: 0,
          endRowIndex: 1003,
          startColumnIndex: 0,
          endColumnIndex: 14,
        },
      },
    },
  });

  // G. Number & Date Formatting for data cells (rows 1 to 1003)
  // Column C (Created At) -> DATE_TIME
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 2,
        endColumnIndex: 3,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // Column H (Delivery Date) -> DATE
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 7,
        endColumnIndex: 8,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // Column I & J (Boxes, Pallets) -> NUMBER
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 8,
        endColumnIndex: 10,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'NUMBER', pattern: '#,##0' },
          horizontalAlignment: 'RIGHT',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // Column L (Delivery Cost) -> CURRENCY / NUMBER with soft highlight for accountant
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 11,
        endColumnIndex: 12,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'NUMBER', pattern: '#,##0.00' },
          horizontalAlignment: 'RIGHT',
          backgroundColor: { red: 0.96, green: 0.99, blue: 0.97 }, // soft green tint
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment,backgroundColor)',
    },
  });

  // Column M (Currency) -> text centered with soft highlight for accountant
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 12,
        endColumnIndex: 13,
      },
      cell: {
        userEnteredFormat: {
          horizontalAlignment: 'CENTER',
          backgroundColor: { red: 0.96, green: 0.99, blue: 0.97 }, // soft green tint
        },
      },
      fields: 'userEnteredFormat(horizontalAlignment,backgroundColor)',
    },
  });

  // Column N (Updated At) -> DATE_TIME
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 1,
        endRowIndex: 1003,
        startColumnIndex: 13,
        endColumnIndex: 14,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // H. Cell Notes for columns L and M headers
  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 11,
        endColumnIndex: 12,
      },
      cell: {
        note: 'Вносится бухгалтером вручную (числовая сумма стоимости доставки)',
      },
      fields: 'note',
    },
  });

  batchRequests.push({
    repeatCell: {
      range: {
        sheetId: effectiveSheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 12,
        endColumnIndex: 13,
      },
      cell: {
        note: 'Валюта расчёта: RUB, KGS или USD',
      },
      fields: 'note',
    },
  });

  // Execute batchUpdate
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: batchRequests }),
  });

  if (!batchRes.ok) {
    console.log('⚠️ Ошибка batchUpdate форматирования (некритично):', await batchRes.text());
  } else {
    console.log('✅ Форматирование успешно применено:');
    console.log('   - 1-я строка закреплена (frozen row: 1)');
    console.log('   - Включён автофильтр на диапазон A1:N');
    console.log('   - Настроена оптимальная ширина всех 14 столбцов');
    console.log('   - Оформлены стильные заголовки (Dark Slate, белый шрифт)');
    console.log('   - Выделены колонки бухгалтера L («Стоимость доставки») и M («Валюта»)!');
  }

  console.log('\n🎉 ИТОГ: Вкладка «Заявки» полностью готова к приёму данных AliBros Logistics!');
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
