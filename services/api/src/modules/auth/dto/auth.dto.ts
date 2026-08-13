import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MotDePasseRobuste!2026', minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Jean K.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MotDePasseRobuste!2026' })
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token opaque reçu à la connexion' })
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Jean K.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}
