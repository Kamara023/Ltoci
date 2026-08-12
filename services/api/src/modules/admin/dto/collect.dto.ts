import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CollectDto {
  @ApiPropertyOptional({ enum: ['latest', 'backfill'], default: 'latest' })
  @IsOptional()
  @IsIn(['latest', 'backfill'])
  mode?: 'latest' | 'backfill';

  @ApiPropertyOptional({
    description: 'Backfill : liste explicite de mois (ex. "juillet 2026") ; absent = tous',
    example: ['juillet 2026', 'juin 2026'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  months?: string[];
}
