import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { UpdateIntegrationSettingsDto } from './integrations.dto';

export class IntegrationsService {
  public static async getByKey(key: string) {
    const settings = await prisma.integrationSettings.findUnique({ where: { key } });
    if (!settings) throw new NotFoundError('IntegrationSettings', key);
    return settings;
  }

  public static async upsert(dto: UpdateIntegrationSettingsDto) {
    return prisma.integrationSettings.upsert({
      where: { key: dto.key },
      create: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        isEnabled: dto.isEnabled,
        config: dto.config as object,
      },
      update: {
        name: dto.name,
        description: dto.description,
        isEnabled: dto.isEnabled,
        config: dto.config as object,
      },
    });
  }
}
