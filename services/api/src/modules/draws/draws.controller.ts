import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { AuthUser, CurrentUser, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { DrawsService } from './draws.service';
import { ListDrawsQueryDto } from './draws.dto';

@ApiTags('draws')
@Controller('draws')
@UseGuards(OptionalJwtGuard)
@UseInterceptors(RedisCacheInterceptor)
export class DrawsController {
  constructor(private readonly draws: DrawsService) {}

  @Get('latest')
  @CacheTTL(60)
  @ApiOperation({ summary: 'Dernier tirage validé de chaque type de tirage' })
  latest() {
    return this.draws.latest();
  }

  @Get()
  @CacheTTL(120)
  @ApiOperation({ summary: 'Historique paginé (profondeur bornée par le plan)' })
  list(@CurrentUser() user: AuthUser | null, @Query() query: ListDrawsQueryDto) {
    return this.draws.list(user?.id ?? null, query);
  }

  @Get(':id')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Détail d’un tirage (ensembles, source, statut)' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.draws.detail(id);
  }
}
