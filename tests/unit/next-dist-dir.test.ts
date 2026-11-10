import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import nextConfigFn from '../../next.config.mjs';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js';

describe('STEP 7.9.3: Next.js distDir separation and configuration integrity', () => {
  it('assigns .next-dev as distDir during development server phase (PHASE_DEVELOPMENT_SERVER)', () => {
    const config = nextConfigFn(PHASE_DEVELOPMENT_SERVER);
    expect(config.distDir).toBe('.next-dev');
  });

  it('assigns standard .next as distDir during production build phase (PHASE_PRODUCTION_BUILD)', () => {
    const config = nextConfigFn(PHASE_PRODUCTION_BUILD);
    expect(config.distDir).toBe('.next');
  });

  it('assigns standard .next as distDir during production server phase (PHASE_PRODUCTION_SERVER)', () => {
    const config = nextConfigFn(PHASE_PRODUCTION_SERVER);
    expect(config.distDir).toBe('.next');
  });

  it('preserves all required Next.js configuration flags across phases', () => {
    for (const phase of [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      const config = nextConfigFn(phase);
      expect(config.reactStrictMode).toBe(true);
      expect(config.poweredByHeader).toBe(false);
      expect(config.serverExternalPackages).toEqual(['argon2', 'pino', 'pino-pretty']);
    }
  });

  it('ensures .next-dev and .next are both listed in .gitignore', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('/.next-dev/');
    expect(gitignore).toContain('/.next/');
  });
});
