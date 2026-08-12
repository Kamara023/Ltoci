import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Saisie manuelle d'un tirage par un administrateur.
 * Les bornes fines (cardinalité exacte, plage 1–90, doublons) sont garanties
 * par le trigger SQL — la violation est renvoyée en erreur 400 explicite.
 */
export class CreateDrawDto {
  @ApiProperty({ example: 'reveil', description: 'Code du type de tirage' })
  @IsString()
  drawTypeCode!: string;

  @ApiProperty({ example: '2026-08-12', description: 'Date du tirage (ISO)' })
  @IsISO8601({ strict: true })
  drawDate!: string;

  @ApiPropertyOptional({ example: '10:00', description: 'Heure du tirage (HH:mm)' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  drawTime?: string;

  @ApiProperty({ example: [4, 17, 33, 58, 89], description: 'Numéros gagnants' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  winningNumbers!: number[];

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], description: 'Numéros machine' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  machineNumbers?: number[];

  @ApiPropertyOptional({ example: 'loto-bonheur', default: 'loto-bonheur' })
  @IsOptional()
  @IsString()
  gameCode?: string;
}
