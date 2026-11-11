'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClientTelegramConnectionInfo,
  generateClientPairingCodeAction,
  unlinkClientTelegramAction,
} from '@/app/actions/profile';

interface ClientTelegramCardProps {
  initialInfo: ClientTelegramConnectionInfo;
}

export function ClientTelegramCard({ initialInfo }: ClientTelegramCardProps) {
  const [info, setInfo] = React.useState<ClientTelegramConnectionInfo>(initialInfo);
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
      const res = await generateClientPairingCodeAction();
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
      const res = await unlinkClientTelegramAction();
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
    <Card className="border-slate-200 shadow-sm p-4 space-y-4 text-xs">
      <CardHeader className="p-0 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Telegram Paper Plane Icon */}
          <div className="w-7 h-7 rounded-full bg-[#24A1DE]/10 flex items-center justify-center text-[#24A1DE]">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </div>
          <div>
            <CardTitle className="text-xs uppercase font-semibold text-slate-700">
              Telegram-уведомления
            </CardTitle>
            <span className="text-[10px] text-slate-400 block">
              @{info.botUsername}
            </span>
          </div>
        </div>

        {isConnected ? (
          <Badge variant="success" className="gap-1 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Подключён
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] text-slate-500">
            Не подключён
          </Badge>
        )}
      </CardHeader>

      <CardContent className="p-0 space-y-3 text-slate-600 leading-relaxed">
        {error && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {isConnected && info.telegramAccount ? (
          /* Connected State Details */
          <div className="space-y-3">
            <p className="text-slate-600">
              Ваш аккаунт привязан к боту. Уведомления о статусах заказов и фотоотчёты отправляются в Telegram.
            </p>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Пользователь:</span>
                <span className="font-semibold text-slate-900">
                  {info.telegramAccount.username
                    ? `@${info.telegramAccount.username}`
                    : info.telegramAccount.firstName || 'Без юзернейма'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Telegram ID:</span>
                <span className="font-mono text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {maskTelegramId(info.telegramAccount.telegramId)}
                </span>
              </div>
              {info.telegramAccount.createdAt && (
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>Подключен:</span>
                  <span>
                    {new Date(info.telegramAccount.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              )}
            </div>

            {/* Unlink Action */}
            <div className="pt-1">
              {!confirmUnlink ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Отвязать Telegram-аккаунт
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-2">
                  <p className="text-[11px] text-red-700">
                    Вы уверены, что хотите отвязать Telegram? Уведомления перестанут приходить в бот.
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
          <div className="space-y-3">
            <p className="text-slate-600">
              Привязка Telegram-бота позволит мгновенно получать статусы приёмки грузов, фотоотчёты и акты приёмки со складов WB и Ozon.
            </p>

            {!info.activePairingCode || isCodeExpired ? (
              /* No Active Code or Expired Code */
              <div className="pt-1">
                {isCodeExpired && (
                  <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    Срок действия предыдущего кода привязки истёк. Сгенерируйте новый код.
                  </div>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleGenerateCode}
                  isLoading={isGenerating}
                  className="w-full text-xs gap-1.5 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  {isCodeExpired ? 'Обновить код привязки' : 'Подключить Telegram'}
                </Button>
              </div>
            ) : (
              /* Active Code Available */
              <div className="bg-slate-50 border border-brand-200/80 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                    Код привязки
                  </span>
                  {secondsRemaining !== null && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-mono">
                      Истекает через: {formatCountdown(secondsRemaining)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-200">
                  <span className="font-mono text-base font-bold text-brand-700 tracking-wider">
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

                {/* Direct Telegram Open Link */}
                <a
                  href={info.activePairingCode.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-8 px-3 text-xs bg-[#24A1DE] text-white hover:bg-[#1E8EC5] inline-flex items-center justify-center font-medium rounded-lg transition-colors shadow-sm gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  Открыть @{info.botUsername}
                </a>

                <div className="text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-200/60">
                  <p className="font-semibold text-slate-700">Инструкция:</p>
                  <p>1. Нажмите «Открыть @{info.botUsername}».</p>
                  <p>2. В Telegram нажмите «Запустить» для автоматической привязки.</p>
                  <p>3. После подтверждения обновите страницу.</p>
                </div>

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={isGenerating}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline"
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
