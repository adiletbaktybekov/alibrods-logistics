import { logger } from '@/lib/logger';

export interface SendTelegramMessageOptions {
  chatId: number | string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
}

export class TelegramBotClient {
  private readonly botToken: string;
  private readonly baseUrl: string;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  public async sendMessage(options: SendTelegramMessageOptions): Promise<boolean> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping sendMessage.');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: options.text,
          parse_mode: options.parseMode || 'HTML',
          reply_markup: options.replyMarkup,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        logger.error({ data, options }, 'Telegram API error returned on sendMessage');
        return false;
      }

      return true;
    } catch (err) {
      logger.error({ err, options }, 'Network error while contacting Telegram API');
      return false;
    }
  }

  public async sendMessageWithRetry(
    options: SendTelegramMessageOptions,
    maxRetries = 2
  ): Promise<boolean> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      const success = await this.sendMessage(options);
      if (success) return true;
      attempt++;
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    return false;
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

let botClientInstance: TelegramBotClient | null = null;

export function getTelegramBotClient(): TelegramBotClient {
  if (!botClientInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    botClientInstance = new TelegramBotClient(token);
  }
  return botClientInstance;
}
