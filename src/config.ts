/**
 * Site-wide constants. The working name lives here only — rename in one place.
 * NOTE: keep SITE_URL in sync with astro.config.mjs (it cannot import this file).
 */
export const SITE_NAME = 'exacttools';
export const SITE_URL = 'https://exacttools.pages.dev';
export const SITE_TAGLINE = 'Free developer tools that run entirely in your browser.';

/** Ads are reserved but disabled. Flipping this only un-collapses the slots. */
export const ADS_ENABLED = false;

export const CATEGORIES: Record<string, string> = {
  text: 'Text',
  data: 'Data',
  converters: 'Converters',
  images: 'Images',
  design: 'Design',
  'dynamics-365': 'Dynamics 365',
};
