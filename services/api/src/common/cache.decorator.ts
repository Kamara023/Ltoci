import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl_seconds';

/** Active le cache Redis sur la route, avec le TTL donné (secondes). */
export const CacheTTL = (seconds: number) => SetMetadata(CACHE_TTL_KEY, seconds);
