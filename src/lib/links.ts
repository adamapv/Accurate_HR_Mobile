// Where a notification leads in the app. The Worker writes a link to a web screen ("/#/my-leave"); the shared rule turns it into that screen's name, and this
// says which of the app's screens that is. A screen the app does not have yet opens the notifications list's own row and nothing more.
import { linkToHash } from '@shared/field-core.js';

const SCREENS: Record<string, string> = {
  field: '/', dashboard: '/', me: '/more',
  'my-timesheet': '/week', timesheet: '/week', 'my-schedule': '/',
  'my-leave': '/leave', 'my-expenses': '/expenses', 'my-qualifications': '/quals', 'my-documents': '/documents', 'my-assets': '/assets', 'my-forms': '/forms',
  chat: '/chats', whs: '/safety-reports', policies: '/safety', 'job-safety': '/safety', 'field/pos': '/pos', 'purchase-orders': '/pos', 'plant-checkout': '/plant', 'my-allowances': '/allowances', 'my-onboarding': '/onboarding', onboarding: '/onboarding', 'my-departure': '/departure', offboarding: '/departure',
};
// The app's screen for a notification's link, or null when the app has none for it yet.
export function screenFor(link: string | null | undefined): string | null {
  const hash = linkToHash(link) as string | null;
  if (!hash) return null;
  return SCREENS[hash.replace(/^#\//, '')] || null;
}
