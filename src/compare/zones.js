// Shared zone vocabulary. Chrome = the site-wide page furniture every page shares.
// The original site splits nav from header while migrated AEM lumps both into
// 'header', so both regions map to one comparable zone: 'header-nav'.
export const CHROME_REGIONS = new Set(['header', 'nav', 'footer']);

export const ZONE_OF_REGION = { header: 'header-nav', nav: 'header-nav', footer: 'footer' };

export const CHROME_ZONES = ['header-nav', 'footer'];
