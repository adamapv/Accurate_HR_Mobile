// One of the person's own reviews (?id=<review>): write the self-assessment and save it as a draft or submit it; once it is submitted it is read only, and the
// manager's comments and rating show once the review is finished (the Worker keeps them back until then). When it is open, what is sent and the words are the
// web app's own rules (shared/field-core.js). It needs signal.
import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { MANAGER_COMMENTS_LABEL, RATING_LABEL, ratingLabel, REVIEW_SAVE_DRAFT, REVIEW_SUBMIT_SELF, reviewFormStart, reviewMeta, reviewSaid, reviewState, SELF_ASSESS_EXAMPLE, SELF_ASSESS_LABEL, SELF_ASSESS_NONE, selfAssessOpen, selfReviewDraft } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate } from '@/lib/dates';
import type { Review } from '@/app/performance';
import { Body, Button, Card, Field, Heading, Loading, Notice, Pill, Problem, Screen, Title, type Tone } from '@/ui';

const day = (d: string) => fmtDate(String(d).slice(0, 10));
const range = (a: string, b: string) => (a === b || !b) ? day(a) : `${day(a)} – ${day(b)}`;

export default function ReviewScreen() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reviews = useRead<{ rows: Review[] }>('/reviews/mine');
  const review = reviews.data?.rows.find(r => r.id === id);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => { if (review && text === null) setText((reviewFormStart(review) as Review).self_assessment || ''); }, [review, text]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!reviews.data) return reviews.error ? <Screen centered><Problem>{reviews.error}</Problem></Screen> : <Loading />;
  if (!review) return <Redirect href="/performance" />;
  if (text === null) return <Loading />;
  const open = selfAssessOpen(review) as boolean, st = reviewState(review) as { tone: Tone; label: string };
  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'draft'); setProblem(''); setSaid('');
    try {
      await api('/reviews', { method: 'PUT', body: selfReviewDraft(review, { self_assessment: text }, submit) });
      await reviews.reload(); changed();
      setSaid(reviewSaid(submit ? 'self_submitted' : undefined) as string);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  return (
    <Screen>
      <Title>{review.cycle_name}</Title>
      <Body tone="muted">{reviewMeta(review, range) as string}</Body>
      <Pill tone={st.tone}>{st.label}</Pill>
      {open
        ? <Field label={SELF_ASSESS_LABEL as string} placeholder={SELF_ASSESS_EXAMPLE as string} value={text} onChangeText={setText} multiline maxLength={5000} />
        : <><Heading>{SELF_ASSESS_LABEL as string}</Heading><Card><Body tone={review.self_assessment ? 'fg' : 'muted'}>{review.self_assessment || (SELF_ASSESS_NONE as string)}</Body></Card></>}
      {!!review.manager_comments && <><Heading>{MANAGER_COMMENTS_LABEL as string}</Heading><Card><Body>{review.manager_comments}</Body></Card></>}
      {!!review.rating && <><Heading>{RATING_LABEL as string}</Heading><Card><Body strong>{(ratingLabel(review.rating) as string) || review.rating}</Body></Card></>}
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem}</Problem>
      {open && <Button onPress={() => { void save(true); }} busy={busy === 'submit'} disabled={!!busy}>{REVIEW_SUBMIT_SELF as string}</Button>}
      {open && <Button kind="plain" onPress={() => { void save(false); }} busy={busy === 'draft'} disabled={!!busy}>{REVIEW_SAVE_DRAFT as string}</Button>}
      <Button kind="plain" onPress={() => router.back()} disabled={!!busy}>Close</Button>
    </Screen>
  );
}
