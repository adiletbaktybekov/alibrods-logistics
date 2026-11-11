'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ManagerTelegramConnectionInfo,
  generateManagerPairingCodeAction,
  unlinkManagerTelegramAction,
} from '@/app/actions/admin';

interface ManagerTelegramCardProps {
  initialInfo: ManagerTelegramConnectionInfo;
}

export function ManagerTelegramCard({ initialInfo }: ManagerTelegramCardProps) {
  const [info, setInfo] = React.useState<ManagerTelegramConnectionInfo>(initialInfo);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isUnlinking, setIsUnlinking] = React.useState(false);
  const [confirmUnlink, setConfirmUnlink] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Time remaining state in seconds
  const [secondsRemaining, setSecondsRemaining] = React.useState<number | null>(() => {
    if (!initialInfo.activePairingCode) return null;
    const expiresMs = new Date(initialInfo.activePairingCode.expiresAt).getTime();
    const diff = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
    return diff;
  });

  // Countdown timer effect
  React.useEffect(() => {
    if (!info.activePairingCode) {
      setSecondsRemaining(null);
      return;
    }

    const expiresMs = new Date(info.activePairingCode.expiresAt).getTime();
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [info.activePairingCode]);

  const handleGenerateCode = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateManagerPairingCodeAction();
      if (!res.success || !res.code || !res.expiresAt || !res.deepLink) {
        setError(res.error || 'Не удалось сгенерировать код');
        return;
      }
      setInfo((prev) => ({
        ...prev,
        activePairingCode: {
          code: res.code!,
          expiresAt: res.expiresAt!,
          deepLink: res.deepLink!,
        },
      }));
    } catch {
      setError('Ошибка сети при получении кода привязки');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!info.activePairingCode) return;
    try {
      await navigator.clipboard.writeText(info.activePairingCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleUnlink = async () => {
    setIsUnlinking(true);
    setError(null);
    try {
      const res = await unlinkManagerTelegramAction();
      if (!res.success) {
        setError(res.error || 'Не удалось отвязать аккаунт');
        return;
      }
      setInfo((prev) => ({
        ...prev,
        telegramAccount: null,
        activePairingCode: null,
      }));
      setConfirmUnlink(false);
    } catch {
      setError('Ошибка сети при отвязке аккаунта');
    } finally {
      setIsUnlinking(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const maskTelegramId = (idStr: string) => {
    if (idStr.length <= 5) return idStr;
    return `${idStr.slice(0, 3)}***${idStr.slice(-3)}`;
  };

  const isConnected = !!info.telegramAccount;
  const isCodeExpired = secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#24A1DE]/10 flex items-center justify-center text-[#24A1DE]">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </div>
          <div>
            <CardTitle className="text-base text-slate-900">
              Служебный Telegram-бот
            </CardTitle>
            <span className="text-xs text-slate-500 block">
              @{info.botUsername}
            </span>
          </div>
        </div>

        {isConnected ? (
          <Badge variant="success" className="gap-1 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Подключён
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-slate-500">
            Не подключён
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-4 space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {isConnected && info.telegramAccount ? (
          /* Connected State Details */
          <div className="space-y-4">
            <p className="text-slate-600">
              Ваш служебный аккаунт успешно связан с ботом <span className="font-semibold text-slate-800">@{info.botUsername}</span>. Оперативные системные уведомления и сводки отгрузок отправляются в этот чат.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block">Telegram логин:</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {info.telegramAccount.username
                    ? `@${info.telegramAccount.username}`
                    : info.telegramAccount.firstName || 'Без юзернейма'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Telegram ID:</span>
                <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                  {maskTelegramId(info.telegramAccount.telegramId)}
                </span>
              </div>

              {info.telegramAccount.createdAt && (
                <div>
                  <span className="text-slate-500 block">Дата привязки:</span>
                  <span className="text-slate-700">
                    {new Date(info.telegramAccount.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block">Статус доставки:</span>
                <span className="text-emerald-700 font-medium">Активна (Private Chat)</span>
              </div>
            </div>

            {/* Unlink Action */}
            <div className="pt-2 border-t border-slate-100">
              {!confirmUnlink ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1.5 font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Отвязать служебный Telegram-аккаунт
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-red-700">
                    Вы уверены, что хотите отвязать Telegram? Личные служебные уведомления перестанут поступать сотруднику в бот.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={handleUnlink}
                      isLoading={isUnlinking}
                      className="text-xs h-7"
                    >
                      Да, отвязать
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmUnlink(false)}
                      disabled={isUnlinking}
                      className="text-xs h-7"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Not Connected State */
          <div className="space-y-4">
            <p className="text-slate-600">
              Привязка к служебному боту AliBros Manager позволяет сотрудникам и администраторам мгновенно получать уведомления о новых заказах, изменениях рейсов, назначении водителей и фотоотчётах приёмки.
            </p>

            {!info.activePairingCode || isCodeExpired ? (
              /* No Active Code or Expired Code */
              <div className="pt-1">
                {isCodeExpired && (
                  <div className="mb-3 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Срок действия предыдущего кода привязки истёк. Сгенерируйте новый одноразовый код.
                  </div>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleGenerateCode}
                  isLoading={isGenerating}
                  className="text-xs gap-1.5 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  {isCodeExpired ? 'Обновить код привязки' : 'Подключить Telegram-бота'}
                </Button>
              </div>
            ) : (
              /* Active Code Available */
              <div className="bg-slate-50 border border-brand-200/80 rounded-xl p-4 space-y-3 max-w-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Код привязки сотрудника
                  </span>
                  {secondsRemaining !== null && (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-mono">
                      Истекает через: {formatCountdown(secondsRemaining)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200">
                  <span className="font-mono text-lg font-bold text-brand-700 tracking-wider">
                    {info.activePairingCode.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="text-slate-500 hover:text-brand-600 p-1.5 rounded transition-colors text-xs flex items-center gap-1"
                    title="Копировать код"
                  >
                    {copied ? (
                      <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Скопировано
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Копировать
                      </span>
                    )}
                  </button>
                </div>

                {/* Direct Deep Link Button */}
                <a
                  href={info.activePairingCode.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-9 px-4 text-xs bg-[#24A1DE] text-white hover:bg-[#1E8EC5] inline-flex items-center justify-center font-medium rounded-lg transition-colors shadow-sm gap-2"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  Открыть @{info.botUsername}
                </a>

                <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-200/60">
                  <p className="font-semibold text-slate-700">Инструкция для сотрудника:</p>
                  <p>1. Нажмите «Открыть @{info.botUsername}».</p>
                  <p>2. В Telegram запустите бота для подтверждения прав менеджера.</p>
                  <p>3. После подтверждения вернитесь в браузер и обновите страницу.</p>
                </div>

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={isGenerating}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    {isGenerating ? 'Генерация...' : 'Сгенерировать другой код'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
