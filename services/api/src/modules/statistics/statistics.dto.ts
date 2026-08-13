import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StatsQueryDto {
  @ApiPropertyOptional({ enum: ['WINNING', 'MACHINE'], default: 'WINNING' })
  @IsOptional()
  @IsIn(['WINNING', 'MACHINE'])
  setType?: 'WINNING' | 'MACHINE';

  @ApiPropertyOptional({ example: 'reveil', description: 'Absent = tous types confondus' })
  @IsOptional()
  @IsString()
  drawTypeCode?: string;

  @ApiPropertyOptional({
    enum: ['ALL', 'LAST_100', 'LAST_50', 'LAST_20', 'LAST_10'],
    default: 'LAST_20',
    description: 'Fenêtre d’analyse — bornée par le plan',
  })
  @IsOptional()
  @IsIn(['ALL', 'LAST_100', 'LAST_50', 'LAST_20', 'LAST_10'])
  window?: string;

  @ApiPropertyOptional({ description: 'Période personnalisée (plan PREMIUM+) — début' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Période personnalisée (plan PREMIUM+) — fin' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ default: 10, maximum: 90, description: 'Top N (hot/cold/pairs)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  limit?: number;

  @ApiPropertyOptional({ enum: ['frequency', 'lift'], default: 'frequency', description: 'Tri des paires' })
  @IsOptional()
  @IsIn(['frequency', 'lift'])
  sort?: 'frequency' | 'lift';
}
