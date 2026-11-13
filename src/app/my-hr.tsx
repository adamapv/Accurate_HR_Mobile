// My HR: the person's own profile. How complete it is and what is missing, their personal details and emergency contact (with Edit when their level lets them
// change their own details), their employment, who they report to (with a call) and how they sign in. Every row, the completeness rule and the words are the
// web app's own (shared/field-core.js); the screen reads the same answer the app signs in with, so it shows with no signal too. Pay & super and PPE & uniform
// are the exception: they are asked for each time and never kept on the phone, so with no signal those two cards say so.
import { Linking, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { DETAIL_CARDS, detailCardAction, detailCardHas, detailGroupsOf, detailItems, emergencyCall, emergencyEmpty, emergencyRows, employmentRows, managerRole, NO_MANAGER, personalRows, PIN_CHANGE_NOTE, PROFILE_EDIT, PROFILE_EDIT_OFF, PROFILE_PANELS, profileFacts, profileGaps, profileSummary, profileVerdict, signInRows,
  telHref } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useDetails, type DetailGroup } from '@/lib/use-details';
import { fmtDate, localToday } from '@/lib/dates';
import { useTheme } from '@/theme';
import { MyPhoto } from '@/my-photo';
import { Body, Button, Card, Empty, Heading, Notice, Screen, Title } from '@/ui';

type RowT = { label: string; value: string; empty?: string; tel?: string };
type Gaps = { checks: { key: string; label: string; ok: boolean }[]; missing: { key: string; title: string }[]; pct: number };
const PANELS = PROFILE_PANELS as { personal: string; emergency: string; employment: string; reportsTo: string; signIn: string };
const day = (d: string) => fmtDate(String(d).slice(0, 10));
const ring = (tel: string) => { void Linking.openURL(tel); };

function Rows({ rows }: { rows: RowT[] }) {
  return (
    <>
      {rows.map(r => (
        <View key={r.label} style={{ gap: 2 }}>
          <Body tone="muted">{r.label}</Body>
          {r.tel ? <Button kind="plain" icon="call-outline" onPress={() => ring(r.tel!)}>{r.value}</Button> : <Body tone={r.value ? 'fg' : 'muted'}>{r.value || r.empty || '—'}</Body>}
        </View>
      ))}
    </>
  );
}

export default function MyHR() {
  const { state } = useSession();
  const t = useTheme();
  const forms = useRead<{ rows: { submitted: unknown }[] }>('/forms');
  const details = useDetails();
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const me = state.me, e = me.employee, p = me.profile || null;
  const canEdit = can(me.access, 'my_details', 'edit') as boolean;
  // How complete the profile is, whoever is allowed to fill it in.
  const gaps = profileGaps(p, forms.data?.rows, true) as Gaps;
  const verdict = profileVerdict(gaps) as { strong: string; rest: string }, summary = profileSummary(gaps) as { ring: string; pct: string; note: string };
  const facts = profileFacts(e, localToday()) as string[];
  const emergency = emergencyRows(p) as RowT[] | null, call = emergencyCall(p) as { label: string; tel: string } | null;
  return (
    <Screen>
      <Title>My HR</Title>
      <Card>
        <MyPhoto name={e.name} photoKey={p?.photo_url} canEdit={canEdit} />
        <Body strong>{p?.aka ? `${e.name} “${p.aka}”` : e.name}</Body>
        {facts.length > 0 && <Body tone="muted">{facts.join(' · ')}</Body>}
        <Body>{`${verdict.strong}${verdict.rest}`}</Body>
        <View accessibilityRole="progressbar" accessibilityLabel={summary.ring} accessibilityValue={{ min: 0, max: 100, now: gaps.pct }} style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
          <View style={{ width: `${gaps.pct}%`, height: 8, backgroundColor: gaps.pct >= 100 ? t.ok : t.accent }} />
        </View>
        <Body tone="muted">{summary.note}</Body>
        {gaps.missing.some(m => m.key === 'forms') && <Button kind="plain" icon="clipboard-outline" onPress={() => router.push('/forms')}>My forms</Button>}
      </Card>

      <Heading right={canEdit ? <Button kind="plain" icon="create-outline" onPress={() => router.push('/edit-profile')}>{PROFILE_EDIT as string}</Button> : undefined}>{PANELS.personal}</Heading>
      <Card><Rows rows={personalRows(p, day) as RowT[]} /></Card>
      {!canEdit && <Notice tone="info">{PROFILE_EDIT_OFF as string}</Notice>}

      <Heading>{PANELS.emergency}</Heading>
      {emergency ? <Card><Rows rows={emergency.map(r => ({ ...r, tel: undefined }))} />{call && <Button kind="plain" icon="call-outline" onPress={() => ring(call.tel)}>{call.label}</Button>}</Card>
        : <Empty icon="call-outline">{emergencyEmpty(canEdit) as string}</Empty>}

      {(DETAIL_CARDS as { key: string; title: string; ids: string[]; blank: string; note: string }[]).map(c => {
        const groups = detailGroupsOf(details.data?.schema, c.ids) as DetailGroup[], has = !!details.data && (detailCardHas(groups, details.data) as boolean);
        return (
          <View key={c.key} style={{ gap: 10 }}>
            <Heading right={details.data ? <Button kind="plain" icon="create-outline" onPress={() => router.push(`/pay-details?card=${c.key}`)}>{detailCardAction(has) as string}</Button> : undefined}>{c.title}</Heading>
            {!details.data ? <Body tone="muted">{details.error || 'Loading…'}</Body>
              : !has ? <Empty icon={c.key === 'pay' ? 'cash-outline' : 'shirt-outline'}>{c.blank}</Empty>
              : groups.map(g => <Card key={g.id}>{groups.length > 1 && <Body strong>{g.label}</Body>}<Rows rows={detailItems(g, details.data) as RowT[]} /></Card>)}
            {has && !!c.note && <Body tone="muted">{c.note}</Body>}
          </View>
        );
      })}

      <Heading>{PANELS.employment}</Heading>
      <Card><Rows rows={employmentRows(e, me.company, day) as RowT[]} /></Card>

      <Heading>{PANELS.reportsTo}</Heading>
      {me.manager ? (
        <Card>
          <Body strong>{me.manager.name}</Body>
          <Body tone="muted">{managerRole(me.manager) as string}</Body>
          {!!me.manager.phone && <Button kind="plain" icon="call-outline" onPress={() => ring(telHref(me.manager!.phone) as string)}>{`Call ${me.manager.name.split(' ')[0]}`}</Button>}
        </Card>
      ) : <Body tone="muted">{NO_MANAGER as string}</Body>}

      <Heading>{PANELS.signIn}</Heading>
      <Card>
        <Rows rows={signInRows(e) as RowT[]} />
        <Body tone="muted">{PIN_CHANGE_NOTE as string}</Body>
        <Button kind="plain" icon="key-outline" onPress={() => router.push('/change-pin?own=1')}>Change PIN</Button>
      </Card>
    </Screen>
  );
}
