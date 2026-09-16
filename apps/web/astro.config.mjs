import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  site: 'https://open-booking.r-arturogi.workers.dev',
  adapter: cloudflare(),
});
