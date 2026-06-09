/**
 * Cron task definitions — registered into the CronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here and records each execution in its own `cron_history` table.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression).
 *
 * Example:
 *
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 60 },
 *   ]
 *
 *   export async function runTask(name: string, env: unknown): Promise<void> {
 *     if (name === 'heartbeat') {
 *       // … do scheduled work here
 *     }
 *   }
 */

import type { CronTask } from 'deepspace/worker'

export const tasks: CronTask[] = []

export async function runTask(_name: string, _env: unknown): Promise<void> {
  // No-op — no scheduled tasks defined. Add entries to `tasks` above and
  // dispatch on `_name` here.
}
