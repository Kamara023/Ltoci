import { Body, Controller, Get, Ip, Patch, Post, UseGuards, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, UpdateMeDto } from './dto/auth.dto';
import { AuthUser, CurrentUser, JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Post('auth/register')
  @ApiOperation({ summary: 'Créer un compte (plan FREE par défaut)' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.displayName);
  }

  @Post('auth/login')
  @ApiOperation({ summary: 'Connexion — verrouillage 15 min après 5 échecs' })
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.auth.login(dto.email, dto.password, userAgent, ip);
  }

  @Post('auth/refresh')
  @ApiOperation({
    summary:
      'Renouvellement — rotation systématique ; un token déjà consommé révoque toutes les sessions',
  })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @ApiOperation({ summary: 'Révoquer la session (refresh token)' })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté (avec plan effectif)' })
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.prisma.user.findUnique({
      where: { id: user!.id },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
    // Plan effectif résolu comme partout ailleurs (souscription ACTIVE sinon
    // FREE) — le front n'a JAMAIS à le deviner.
    const ent = await this.entitlements.forUser(user!.id);
    return { ...full, plan: ent.plan };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour son profil' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id: user!.id },
      data: { displayName: dto.displayName },
      select: { id: true, email: true, displayName: true, role: true },
    });
  }
}
