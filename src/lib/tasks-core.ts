// What Home's "Today's tasks" card reads and sends, with nothing from React Native in it so scripts/test-tasks.mjs can run it in Node.
// A driver is someone whose access level has the Tasks area and Takes tasks. Their published tasks are read from GET /tasks/mine, and Done and Undo are written through the
// outbox (shared/offline-queue.js) so they wait on the phone with no signal and are sent once. What a day of tasks is (what is next, what is done, what is later, what is from
// an earlier day, what waits for signal) is the web Field view's own rule (shared/task-core.js); this file only wires it to the phone's outbox and reads.
import { can } from '../../shared/access.js';
import { addDays, applyQueued, fieldDay, queuedDraft } from '../../shared/task-core.js';
import type { Draft, Entry } from './offline-core';

export type TaskAction = 'done' | 'reopen';
// A task as GET /tasks/mine sends it (the fields AccurateHR's scripts/test-mobile-contract.mjs lists for it; the card reads these and no others).
export type Task = {
  id: string; title: string; notes: string | null; status: string; task_date: string; sort_order: number;
  from_place: string | null; from_lat: number | null; from_lng: number | null; to_place: string | null; to_lat: number | null; to_lng: number | null;
  company_id: string | null; job_id: string | null; job_name?: string | null; job_display_name?: string | null;
};
export type MyTasks = { today?: string; rows: Task[] };
// A task with what is still waiting on the phone laid over it: `waiting` is the action not yet sent, `failed` the Worker's words when it refused one.
export type TaskRow = Task & { waiting: TaskAction | null; failed: string | null };
export type TaskDay = { open: TaskRow[]; done: TaskRow[]; next: TaskRow | null; total: number; later: { date: string; count: number } | null };
type Access = Record<string, { scope: string; edit: boolean; approve: boolean }> | null | undefined;

export const UNDO_MS = 10000;   // how long Undo stays after Done
export const LOCK_MS = 700;     // after Done the next task's Done is held this long, so a double tap finishes one task and not two
export const AHEAD_DAYS = 7;    // today's tasks, and the next published day if there are none (as the web Field view reads them)
// The smallest things a driver's thumb is asked to hit: Done is the whole point of the card, so it is the biggest thing on Home.
export const TASK_SIZES = { done: 76, row: 64, touch: 48 } as const;

// Only a driver is shown the card and only a driver's phone asks for the list (the web Field view's rule): the Tasks area, and Takes tasks.
export const isDriver = (access: Access): boolean => can(access, 'tasks') && can(access, 'takes_tasks');
// The list to read for a driver on `today`, or null for anyone else (a read of null makes no request).
export const tasksPath = (access: Access, today: string): string | null => (isDriver(access) ? `/tasks/mine?from=${today}&to=${addDays(today, AHEAD_DAYS)}` : null);
// Done or Undo, as the outbox keeps it.
export const taskDraft = (row: { id: string; title: string }, action: TaskAction): Draft => queuedDraft(row, action) as unknown as Draft;
// The driver's day: the server's tasks with this session's waiting and failed entries laid over them (a Done with no signal already shows as done).
export const taskView = (rows: Task[] | undefined, entries: Entry[], today: string): TaskDay => fieldDay(applyQueued(rows || [], entries), today) as unknown as TaskDay;
