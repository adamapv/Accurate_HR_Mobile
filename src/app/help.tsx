// Help: the product's own help, topic by topic, showing only the tasks the signed-in person's role or level can do, with a search. The topics, who sees
// which task, what the search keeps and every word are the web app's own (shared/help.js); the copy in the app is the one from the build, so a newer
// answer may be in the browser. "Go to" offers only the screens this app has.
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ALL_GUIDES_URL, HELP_WORDS, helpByGroup, youAre } from '@shared/help.js';
import { useSession } from '@/lib/session';
import { screenFor } from '@/lib/links';
import { Body, Button, Card, Empty, Field, Heading, Notice, Screen, Title } from '@/ui';

type Task = { title: string; about: string; guide?: string };
type Topic = { id: string; name: string; overview?: string; intro: string; good?: string[]; screens: [string, string][] };
type Group = { group: { id: string; label: string }; topics: { topic: Topic; tasks: Task[] }[] };
const WORDS = HELP_WORDS as { search: string; guides: string; guide: string; good: string; goTo: string; none: string };

export default function Help() {
  const { state } = useSession();
  const [q, setQ] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const role = state.me.employee.role;
  const groups = helpByGroup(role, state.me.access, q) as unknown as Group[];
  const who = youAre(role) as { strong: string; rest: string } | null;
  const open = (url: string) => { void Linking.openURL(url); };
  return (
    <Screen>
      <Title>Help</Title>
      {!!ALL_GUIDES_URL && <Button kind="plain" icon="open-outline" onPress={() => open(ALL_GUIDES_URL as string)}>{WORDS.guides}</Button>}
      {who && <Notice tone="info">{`${who.strong}${who.rest}`}</Notice>}
      <Field label="Search" placeholder={WORDS.search} value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      {groups.length === 0 && <Empty icon="search-outline">{WORDS.none}</Empty>}
      {groups.map(g => (
        <View key={g.group.id} style={{ gap: 10 }}>
          <Heading>{g.group.label}</Heading>
          {g.topics.map(({ topic, tasks }) => {
            const pages = topic.screens.map(([path, label]) => ({ label, to: screenFor(`/#/${path}`) })).filter((p, n, all) => !!p.to && all.findIndex(x => x.to === p.to) === n);
            return (
              <Card key={topic.id}>
                <Body strong>{topic.name}</Body>
                {!!topic.overview && <Body>{topic.overview}</Body>}
                <Body tone="muted">{topic.intro}</Body>
                {tasks.map(task => (
                  <View key={task.title} style={{ gap: 2 }}>
                    <Body strong>{task.title}</Body>
                    <Body tone="muted">{task.about}</Body>
                    {!!task.guide && <Button kind="plain" icon="open-outline" onPress={() => open(task.guide!)}>{WORDS.guide}</Button>}
                  </View>
                ))}
                {!!topic.good?.length && (
                  <View style={{ gap: 2 }}>
                    <Body strong>{WORDS.good}</Body>
                    {topic.good.map(line => <Body key={line} tone="muted">{`• ${line}`}</Body>)}
                  </View>
                )}
                {pages.length > 0 && <Body tone="muted">{WORDS.goTo}</Body>}
                {pages.map(p => <Button key={p.to} kind="plain" onPress={() => router.push(p.to as never)}>{p.label}</Button>)}
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
