// Where a company is: its Australian state or territory, the time zone its days run on, and the work health and safety regulator it
// notifies. Shared by the browser (Company details, the incident screens) and the Worker (dates, emails, the incident alert), so both
// agree. A company's own choices (its time zone, a corrected regulator number) are kept with its details; what is here is only where
// they start from. ACC-76.

export const DEFAULT_TIMEZONE = 'Australia/Melbourne';

// The time zones a company can choose (Australia only, ACC-63). The state suggests one; Broken Hill and Lord Howe-type exceptions
// are why it is a setting of its own.
export const TIMEZONES = [
  ['Australia/Sydney', 'Sydney (NSW, ACT), daylight saving'],
  ['Australia/Melbourne', 'Melbourne (VIC), daylight saving'],
  ['Australia/Hobart', 'Hobart (TAS), daylight saving'],
  ['Australia/Adelaide', 'Adelaide (SA), daylight saving'],
  ['Australia/Broken_Hill', 'Broken Hill (NSW, on Adelaide time), daylight saving'],
  ['Australia/Brisbane', 'Brisbane (QLD), no daylight saving'],
  ['Australia/Darwin', 'Darwin (NT), no daylight saving'],
  ['Australia/Perth', 'Perth (WA), no daylight saving'],
];

// `regulator` is who is called, `phone` the number to ring (digits only in `tel`), `act` the law that says so, and `written` what happens in
// writing afterwards. These are a starting point: a company can correct any of them under Company details.
export const STATES = {
  VIC: { name: 'Victoria', tz: 'Australia/Melbourne', whs: { regulator: 'WorkSafe Victoria', phone: '13 23 60', act: 'Occupational Health and Safety Act 2004 (Vic), Part 5', written: 'Written notice goes to WorkSafe within 48 hours.' } },
  NSW: { name: 'New South Wales', tz: 'Australia/Sydney', whs: { regulator: 'SafeWork NSW', phone: '13 10 50', act: 'Work Health and Safety Act 2011 (NSW)', written: 'SafeWork NSW may ask for written notice, which is due within 48 hours.' } },
  QLD: { name: 'Queensland', tz: 'Australia/Brisbane', whs: { regulator: 'Workplace Health and Safety Queensland', phone: '1300 362 128', act: 'Work Health and Safety Act 2011 (Qld)', written: 'Workplace Health and Safety Queensland may ask for written notice, which is due within 48 hours.' } },
  SA: { name: 'South Australia', tz: 'Australia/Adelaide', whs: { regulator: 'SafeWork SA', phone: '1800 777 209', act: 'Work Health and Safety Act 2012 (SA)', written: 'SafeWork SA may ask for written notice, which is due within 48 hours.' } },
  WA: { name: 'Western Australia', tz: 'Australia/Perth', whs: { regulator: 'WorkSafe WA', phone: '1300 307 877', act: 'Work Health and Safety Act 2020 (WA)', written: 'WorkSafe WA may ask for written notice, which is due within 48 hours.' } },
  TAS: { name: 'Tasmania', tz: 'Australia/Hobart', whs: { regulator: 'WorkSafe Tasmania', phone: '1300 366 322', act: 'Work Health and Safety Act 2012 (Tas)', written: 'WorkSafe Tasmania may ask for written notice, which is due within 48 hours.' } },
  ACT: { name: 'Australian Capital Territory', tz: 'Australia/Sydney', whs: { regulator: 'WorkSafe ACT', phone: '(02) 6207 3000', act: 'Work Health and Safety Act 2011 (ACT)', written: 'WorkSafe ACT may ask for written notice, which is due within 48 hours.' } },
  NT: { name: 'Northern Territory', tz: 'Australia/Darwin', whs: { regulator: 'NT WorkSafe', phone: '1800 019 115', act: 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)', written: 'NT WorkSafe may ask for written notice, which is due within 48 hours.' } },
};
export const STATE_CODES = Object.keys(STATES);

// "Vic", "victoria" or "VIC " → 'VIC'; anything else → null (a company's address state was free text before this).
export function stateCode(text) {
  const t = String(text ?? '').trim().toUpperCase().replace(/\./g, '');
  if (!t) return null;
  if (STATES[t]) return t;
  return STATE_CODES.find(c => STATES[c].name.toUpperCase() === t) || null;
}

export const validTimezone = tz => TIMEZONES.some(([z]) => z === tz);

// The time zone a company's days run on: its own choice, else its state's, else Melbourne's (what every company had before this).
export function zoneOf(row) {
  if (validTimezone(row?.timezone)) return row.timezone;
  return STATES[stateCode(row?.state)]?.tz || DEFAULT_TIMEZONE;
}

// Who a company calls about a notifiable incident, from a company-settings row: its own corrections over its state's details. With no state
// set it is generic (no number to ring), so nobody is sent to the wrong regulator.
export function whsOf(row) {
  const base = STATES[stateCode(row?.state)]?.whs || null;
  const clean = v => { const s = String(v ?? '').trim(); return s || null; };
  const regulator = clean(row?.whs_regulator_name) || base?.regulator || 'your state’s work health and safety regulator';
  const phone = clean(row?.whs_regulator_phone) || base?.phone || null;
  return {
    regulator, phone,
    tel: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : null,
    act: clean(row?.whs_act_name) || base?.act || null,
    written: base?.written || 'Written notice may be needed within 48 hours: the regulator will say.',
    eap: clean(row?.eap_phone),   // the company's own support line, if it has one
    set: !!(base || clean(row?.whs_regulator_phone)),
  };
}
