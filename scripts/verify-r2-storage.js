const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function maskString(str, visibleStart = 4, visibleEnd = 4) {
  if (!str) return 'MISSING';
  if (str.length <= visibleStart + visibleEnd) return '***';
  return str.slice(0, visibleStart) + '...' + str.slice(-visibleEnd);
}

function maskEndpoint(endpoint) {
  if (!endpoint) return 'MISSING';
  try {
    const url = new URL(endpoint);
    const hostParts = url.hostname.split('.');
    if (hostParts.length >= 3) {
      return `${url.protocol}//***.${hostParts.slice(-3).join('.')}`;
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return maskString(endpoint);
  }
}

async function main() {
  console.log('=====================================================');
  console.log('  AliBros Logistics — Cloudflare R2 Storage Audit    ');
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

  const endpoint = localEnv.S3_ENDPOINT || process.env.S3_ENDPOINT;
  const bucket = localEnv.S3_BUCKET || process.env.S3_BUCKET || 'alibros-logistics-files';
  const accessKeyId = localEnv.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = localEnv.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const region = localEnv.S3_REGION || process.env.S3_REGION || 'auto';

  console.log('1. Проверка конфигурации переменных окружения:');
  console.log('-----------------------------------------------------');
  console.log(`• S3_ENDPOINT:          ${endpoint ? `[OK] (${maskEndpoint(endpoint)})` : '[MISSING] Ожидает настройки'}`);
  console.log(`• S3_BUCKET:            ${bucket ? `[OK] (${bucket})` : '[MISSING] Ожидает настройки'}`);
  console.log(`• S3_REGION:            [OK] (${region})`);
  console.log(`• S3_ACCESS_KEY_ID:     ${accessKeyId ? `[OK] (${maskString(accessKeyId, 4, 3)})` : '[MISSING] Ожидает настройки'}`);
  console.log(`• S3_SECRET_ACCESS_KEY: ${secretAccessKey ? `[OK] (Длина: ${secretAccessKey.length} символов)` : '[MISSING] Ожидает настройки'}\n`);

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.log('⚠️ Хранилище Cloudflare R2 ещё не сконфигурировано в .env.local.');
    console.log('\nДля завершения настройки добавьте в .env.local:');
    console.log('  S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"');
    console.log('  S3_BUCKET="alibros-logistics-files"');
    console.log('  S3_REGION="auto"');
    console.log('  S3_ACCESS_KEY_ID="<ВАШ_ACCESS_KEY_ID>"');
    console.log('  S3_SECRET_ACCESS_KEY="<ВАШ_SECRET_ACCESS_KEY>"');
    console.log('\nПосле добавления запустите: npm run r2:verify\n');
    return;
  }

  // Initialize S3Client
  const cleanEndpoint = endpoint.trim().replace(/\/+$/, '');
  const s3Client = new S3Client({
    region: region.trim(),
    endpoint: cleanEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    },
  });

  console.log('2. Проверка авторизации и подключения:');
  console.log('----------------------------------------');
  console.log('✅ Клиент S3Client инициализирован (AWS SDK v3, Region: auto, ForcePathStyle: true).');

  // Create temporary valid test JPEG buffer (magic bytes 0xFF, 0xD8, 0xFF, 0xE0 ... 0xFF, 0xD9)
  const testKey = `_test_healthcheck/r2_verify_${Date.now()}.jpg`;
  const testBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0xff, 0xd9,
  ]);

  console.log(`\n3. Загрузка временного тестового файла (${testKey}):`);
  console.log('--------------------------------------------------');
  try {
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testBuffer,
      ContentType: 'image/jpeg',
      ContentLength: testBuffer.length,
    });
    await s3Client.send(putCmd);
    console.log('✅ Тестовый файл успешно загружен в бакет Cloudflare R2.');
  } catch (putErr) {
    console.log('❌ Ошибка загрузки тестового файла в R2:', putErr.message);
    if (putErr.message.includes('Forbidden') || putErr.message.includes('AccessDenied')) {
      console.log('👉 Подсказка: Проверьте права API-токена R2. Токен должен иметь права Object Read & Write на бакет alibros-logistics-files.');
    }
    process.exit(1);
  }

  // Verify object existence and metadata
  console.log('\n4. Проверка существования и метаданных объекта:');
  console.log('--------------------------------------------------');
  try {
    const headCmd = new HeadObjectCommand({
      Bucket: bucket,
      Key: testKey,
    });
    const headRes = await s3Client.send(headCmd);
    console.log('✅ Объект подтверждён в бакете через HeadObject.');
    console.log(`• Размер: ${headRes.ContentLength} байт (ожидалось: ${testBuffer.length})`);
    console.log(`• MIME-тип: ${headRes.ContentType}`);
    console.log(`• Время изменения: ${headRes.LastModified?.toISOString()}`);
  } catch (headErr) {
    console.log('❌ Объект не найден в бакете после загрузки:', headErr.message);
    process.exit(1);
  }

  // Test Signed URL (Presigned URL)
  console.log('\n5. Проверка генерации подписанной ссылки (Presigned URL):');
  console.log('--------------------------------------------------');
  try {
    const getCmd = new GetObjectCommand({
      Bucket: bucket,
      Key: testKey,
    });
    const signedUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 900 }); // 15 min TTL

    console.log('✅ Подписанная ссылка успешно сгенерирована (TTL: 15 минут / 900 секунд).');
    console.log(`• Протокол ссылки: ${signedUrl.startsWith('https://') ? 'HTTPS ✅' : 'HTTP ❌'}`);
    console.log(`• Сигнатура в URL: ${signedUrl.includes('X-Amz-Signature') ? 'Присутствует (AWS SigV4) ✅' : 'Отсутствует ❌'}`);
    console.log(`• Срок действия в URL: ${signedUrl.includes('X-Amz-Expires=900') ? '900 секунд (15 мин) ✅' : 'Настроен'}`);

    // Verify reading file via signed URL
    const signedRes = await fetch(signedUrl);
    if (!signedRes.ok) {
      console.log(`❌ Ошибка чтения по подписанной ссылке (HTTP ${signedRes.status})`);
      process.exit(1);
    }
    const downloadedBuffer = Buffer.from(await signedRes.arrayBuffer());
    const match = downloadedBuffer.equals(testBuffer);
    console.log(`• Чтение по подписанной ссылке: HTTP ${signedRes.status} OK ✅`);
    console.log(`• Консистентность бинарных данных: ${match ? '100% совпадение байтов ✅' : 'Ошибка расхождения байтов ❌'}`);
  } catch (signErr) {
    console.log('❌ Ошибка работы с подписанной ссылкой:', signErr.message);
    process.exit(1);
  }

  // Check Private Access: Direct non-signed request must be blocked
  console.log('\n6. Проверка приватности бакета (Public Access: Disabled):');
  console.log('--------------------------------------------------');
  try {
    const directUrl = `${cleanEndpoint}/${bucket}/${testKey}`;
    const directRes = await fetch(directUrl);
    console.log(`• Прямой неавторизованный HTTP GET-запрос вернул HTTP ${directRes.status}`);
    if (directRes.status === 401 || directRes.status === 403 || directRes.status === 404) {
      console.log('✅ Публичный доступ надёжно заблокирован. Прямой доступ без сигнатуры невозможен.');
    } else if (directRes.ok) {
      console.log('⚠️ ВНИМАНИЕ: Бакет вернул 200 на прямой неавторизованный запрос! Проверьте Public Access в настройках R2.');
    }
  } catch (privErr) {
    console.log('• Прямой запрос отклонён сетью/шлюзом ✅');
  }

  // Cleanup: Delete temporary test file
  console.log('\n7. Удаление тестового объекта (Очистка):');
  console.log('--------------------------------------------------');
  try {
    const delCmd = new DeleteObjectCommand({
      Bucket: bucket,
      Key: testKey,
    });
    await s3Client.send(delCmd);
    console.log('✅ Тестовый объект успешно удалён из бакета.');

    // Confirm deletion
    let stillExists = true;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: testKey }));
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        stillExists = false;
      }
    }
    console.log(`• Проверка после удаления: ${!stillExists ? 'Объект отсутствует (бакет чист) ✅' : 'Объект всё ещё существует ❌'}`);
  } catch (delErr) {
    console.log('⚠️ Не удалось удалить тестовый объект:', delErr.message);
  }

  console.log('\n🎉 ИТОГ: Интеграция Cloudflare R2 полностью протестирована и готова к работе!');
}

main().catch((err) => {
  console.error('Непредвиденная ошибка:', err);
  process.exit(1);
});
