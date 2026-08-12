import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ResolveIssueDto {
  @ApiProperty({ example: 'Vérifié contre la vidéo officielle du tirage' })
  @IsString()
  @MaxLength(1000)
  note!: string;
}

export class InvalidateDrawDto {
  @ApiProperty({ example: 'Numéros incohérents avec la publication officielle' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class UpdateDrawNumbersDto {
  @ApiPropertyOptional({ example: [4, 17, 33, 58, 89] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  winningNumbers?: number[];

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  machineNumbers?: number[];

  @ApiProperty({ example: 'Correction après vérification manuelle', description: 'Motif audité' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class QualityRunDto {
  @ApiPropertyOptional({ enum: ['pending', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'all'])
  scope?: 'pending' | 'all';
}
