import { logger } from '@/lib/logger';

export interface SendTelegramMessageOptions {
  chatId: number | string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  replyMarkup?: unknown;
  messageThreadId?: number | string;
}

export interface EditTelegramMessageOptions {
  chatId: number | string;
  messageId: number | string;
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

  public getBotToken(): string {
    return this.botToken;
  }

  public async sendMessage(options: SendTelegramMessageOptions): Promise<boolean> {
    if (!this.botToken) {
      logger.warn({
        event: 'TELEGRAM_API_ERROR',
        description: 'Telegram bot token not configured. Skipping sendMessage.',
        chatId: options.chatId,
      });
      return false;
    }

    logger.info({
      event: 'TELEGRAM_API_REQUEST_STARTED',
      chatId: options.chatId,
      hasThreadId: options.messageThreadId !== undefined && options.messageThreadId !== null,
    });

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: options.text,
          parse_mode: options.parseMode || 'HTML',
          reply_markup: options.replyMarkup,
          ...(options.messageThreadId !== undefined && options.messageThreadId !== null
            ? { message_thread_id: Number(options.messageThreadId) }
            : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        logger.error({
          event: 'TELEGRAM_API_ERROR',
          httpStatus: response.status,
          errorCode: data?.error_code,
          description: data?.description || 'Telegram API returned non-OK response',
          chatId: options.chatId,
        });
        return false;
      }

      logger.info({
        event: 'TELEGRAM_API_SUCCESS',
        chatId: options.chatId,
        messageId: data.result?.message_id,
      });

      return true;
    } catch (err) {
      logger.error({
        event: 'TELEGRAM_API_ERROR',
        httpStatus: 0,
        description: err instanceof Error ? err.message : 'Network error while contacting Telegram API',
        chatId: options.chatId,
      });
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

  public async editMessageText(options: EditTelegramMessageOptions): Promise<boolean> {
    if (!this.botToken) {
      logger.warn({
        event: 'TELEGRAM_API_ERROR',
        description: 'Telegram bot token not configured. Skipping editMessageText.',
        chatId: options.chatId,
        messageId: options.messageId,
      });
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chatId,
          message_id: Number(options.messageId),
          text: options.text,
          parse_mode: options.parseMode || 'HTML',
          reply_markup: options.replyMarkup,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        logger.error({
          event: 'TELEGRAM_API_ERROR',
          httpStatus: response.status,
          errorCode: data?.error_code,
          description: data?.description || 'Telegram API returned non-OK response for editMessageText',
          chatId: options.chatId,
          messageId: options.messageId,
        });
        return false;
      }
      return true;
    } catch (err) {
      logger.error({
        event: 'TELEGRAM_API_ERROR',
        httpStatus: 0,
        description: err instanceof Error ? err.message : 'Network error while contacting Telegram API for editMessageText',
        chatId: options.chatId,
        messageId: options.messageId,
      });
      return false;
    }
  }

  /**
   * Retrieves basic information about the bot via getMe.
   */
  public async getMe(): Promise<{ id: number; is_bot: boolean; first_name: string; username?: string } | null> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping getMe.');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/getMe`, {
        method: 'GET',
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.result) {
        logger.error({ data }, 'Failed to call getMe from Telegram API');
        return null;
      }

      return data.result;
    } catch (err) {
      logger.error({ err }, 'Network error while calling Telegram getMe API');
      return null;
    }
  }

  /**
   * Retrieves basic chat information via getChat.
   */
  public async getChat(
    chatId: number | string
  ): Promise<{ id: number | string; type: string; title?: string; username?: string; description?: string } | null> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping getChat.');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/getChat?chat_id=${encodeURIComponent(chatId)}`, {
        method: 'GET',
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.result) {
        logger.error({ chatId, data }, 'Failed to call getChat from Telegram API');
        return null;
      }

      return data.result;
    } catch (err) {
      logger.error({ err, chatId }, 'Network error while calling Telegram getChat API');
      return null;
    }
  }

  /**
   * Retrieves chat member information and permissions via getChatMember.
   */
  public async getChatMember(
    chatId: number | string,
    userId: number | string
  ): Promise<{
    status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
    can_post_messages?: boolean;
    can_send_messages?: boolean;
    is_anonymous?: boolean;
  } | null> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping getChatMember.');
      return null;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`,
        { method: 'GET' }
      );

      const data = await response.json();
      if (!response.ok || !data.ok || !data.result) {
        logger.error({ chatId, userId, data }, 'Failed to call getChatMember from Telegram API');
        return null;
      }

      return data.result;
    } catch (err) {
      logger.error({ err, chatId, userId }, 'Network error while calling Telegram getChatMember API');
      return null;
    }
  }

  /**
   * Retrieves file information from Telegram Bot API via getFile.
   */
  public async getFile(
    fileId: string
  ): Promise<{ file_id: string; file_unique_id?: string; file_size?: number; file_path?: string } | null> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping getFile.');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`, {
        method: 'GET',
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.result) {
        logger.error({ fileId, data }, 'Failed to get file metadata from Telegram API');
        return null;
      }

      return data.result;
    } catch (err) {
      logger.error({ err, fileId }, 'Network error while calling Telegram getFile API');
      return null;
    }
  }

  /**
   * Downloads raw file buffer from Telegram Bot API via file URL.
   */
  public async downloadFile(filePath: string): Promise<Buffer | null> {
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured. Skipping downloadFile.');
      return null;
    }

    try {
      const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        logger.error({ filePath, status: response.status }, 'Failed to download file from Telegram');
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      logger.error({ err, filePath }, 'Network error while downloading file from Telegram');
      return null;
    }
  }
}

let driverBotInstance: TelegramBotClient | null = null;
let clientBotInstance: TelegramBotClient | null = null;
let managerBotInstance: TelegramBotClient | null = null;

export function getDriverTelegramBotClient(): TelegramBotClient {
  const token =
    process.env.TELEGRAM_DRIVER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!driverBotInstance || driverBotInstance.getBotToken() !== token) {
    driverBotInstance = new TelegramBotClient(token);
  }
  return driverBotInstance;
}

export function getClientTelegramBotClient(): TelegramBotClient {
  const token =
    process.env.TELEGRAM_CLIENT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!clientBotInstance || clientBotInstance.getBotToken() !== token) {
    clientBotInstance = new TelegramBotClient(token);
  }
  return clientBotInstance;
}

export function getManagerTelegramBotClient(): TelegramBotClient {
  const token =
    process.env.TELEGRAM_MANAGER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!managerBotInstance || managerBotInstance.getBotToken() !== token) {
    managerBotInstance = new TelegramBotClient(token);
  }
  return managerBotInstance;
}

/**
 * Backward-compatible default getter (defaults to Driver Bot)
 */
export function getTelegramBotClient(): TelegramBotClient {
  return getDriverTelegramBotClient();
}

export function resetTelegramBotClient(): void {
  driverBotInstance = null;
  clientBotInstance = null;
  managerBotInstance = null;
}

