// The driver's tasks for Home: the list read (kept for reading with no signal, for this session), what is waiting in the outbox laid over it, and Done and Undo.
// Nothing is read for anyone who is not a driver (tasksPath is null, and a read of null makes no request). A tap is written through the outbox, never straight to the Worker.
import { useCallback, useMemo, useState } from 'react';
import { feel } from './haptics';
import { useSession } from './session';
import { useOutbox } from './use-outbox';
import { useRead } from './use-read';
import { isDriver, taskDraft, tasksPath, taskView, type MyTasks, type Task, type TaskAction, type TaskDay } from './tasks-core';

export function useTasks(today: string) {
  const { state, offline } = useSession();
  const access = state.status === 'signedIn' ? state.me.access : undefined;
  const driver = isDriver(access);
  const read = useRead<MyTasks>(tasksPath(access, today));
  const queued = useOutbox();
  const [busy, setBusy] = useState('');       // the task being sent right now
  const [problem, setProblem] = useState(''); // the Worker's words when it refused a tap
  const day = useMemo<TaskDay | null>(() => (driver && read.data ? taskView(read.data.rows, queued, today) : null), [driver, read.data, queued, today]);
  const { reload } = read;
  // true when the tap was taken: sent, or kept on the phone to be sent when there is signal. A refusal is put in `problem`.
  const send = useCallback(async (row: Task, action: TaskAction): Promise<boolean> => {
    setProblem(''); setBusy(row.id);
    let taken = false;
    try {
      const r = await offline.submit(taskDraft(row, action));
      if (r.outcome === 'sent') await reload();
      feel.saved();
      taken = true;
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
      await reload();   // the task may have been changed in the office: show it as it is
    }
    setBusy('');
    return taken;
  }, [offline, reload]);
  return { driver, read, day, busy, problem, send };
}
