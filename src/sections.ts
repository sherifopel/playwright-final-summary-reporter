import type { SectionDef } from './types';

/**
 * Default section definitions.
 * Tests are bucketed into sections based on their @tags.
 * Pass a custom `sections` array in reporter options to override.
 */
export const DEFAULT_SECTIONS: SectionDef[] = [
  { key: 'accounts', label: 'Account & Auth', matchers: ['@accounts', '@account', '@registration', '@address-book', '@breadcrumbs'] },
  { key: 'accessibility', label: 'Accessibility', matchers: ['@axe', '@axe-uat', '@axe-prod', '@accessibility'] },
  { key: 'analytics', label: 'Analytics', matchers: ['@analytics'] },
  { key: 'billing', label: 'Billing', matchers: ['@billing'] },
  { key: 'cart', label: 'Cart', matchers: ['@cart'] },
  { key: 'checkout', label: 'Checkout', matchers: ['@checkout'] },
  { key: 'cms', label: 'CMS Pages', matchers: ['@cms'] },
  { key: 'content', label: 'Content', matchers: ['@content', '@testimonials'] },
  { key: 'footer', label: 'Footer', matchers: ['@footer'] },
  { key: 'header', label: 'Header', matchers: ['@header'] },
  { key: 'homepage', label: 'Home Page', matchers: ['@homepage'] },
  { key: 'identity', label: 'Identity', matchers: ['@identity', '@login', '@logout', '@session'] },
  { key: 'navigation', label: 'Navigation', matchers: ['@navigation'] },
  { key: 'order-confirmation', label: 'Order Confirmation', matchers: ['@order-confirmation'] },
  { key: 'payment', label: 'Payment', matchers: ['@payment', '@apple_pay', '@express'] },
  { key: 'pdp', label: 'Product Detail Page', matchers: ['@pdp'] },
  { key: 'plp', label: 'Product Listing Page', matchers: ['@plp', '@load-more', '@wishlist'] },
  { key: 'routing', label: 'Routing', matchers: ['@routing', '@locale-routing'] },
  { key: 'search', label: 'Search', matchers: ['@search'] },
  { key: 'visual-regression', label: 'Visual Regression', matchers: ['@visual'] },
];

export const OTHER_SECTION: SectionDef = { key: 'other', label: 'Other', matchers: [] };
