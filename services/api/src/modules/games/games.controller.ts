import { Controller, Get, NotFoundException, Param, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('games')
@Controller('games')
@UseInterceptors(RedisCacheInterceptor)
export class GamesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @CacheTTL(300)
  @ApiOperation({ summary: 'Jeux disponibles avec leurs règles et types de tirage' })
  async list() {
    const games = await this.prisma.game.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        operator: true,
        countryCode: true,
        setTypes: {
          orderBy: { displayOrder: 'asc' },
          select: {
            code: true,
            label: true,
            numbersCount: true,
            numberMin: true,
            numberMax: true,
          },
        },
        drawTypes: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          select: { code: true, name: true, scheduledTime: true, metadata: true },
        },
      },
    });
    return { data: games };
  }

  @Get(':code')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Détail d’un jeu par code (ex. loto-bonheur)' })
  async detail(@Param('code') code: string) {
    const game = await this.prisma.game.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        operator: true,
        countryCode: true,
        metadata: true,
        setTypes: {
          orderBy: { displayOrder: 'asc' },
          select: {
            code: true,
            label: true,
            numbersCount: true,
            numberMin: true,
            numberMax: true,
          },
        },
        drawTypes: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          select: { code: true, name: true, scheduledTime: true },
        },
      },
    });
    if (!game) throw new NotFoundException(`Jeu inconnu : ${code}`);
    return game;
  }
}
