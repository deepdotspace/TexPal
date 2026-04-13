import type { CollectionSchema } from 'deepspace/worker'

export const compilationLogsSchema: CollectionSchema = {
  name: 'compilationLogs',
  columns: [
    { name: 'documentId', storage: 'text', interpretation: 'plain' },
    { name: 'compiled', storage: 'number', interpretation: 'plain' },
    { name: 'duration', storage: 'number', interpretation: 'plain' },
    { name: 'errorsCount', storage: 'number', interpretation: 'plain' },
    { name: 'warningsCount', storage: 'number', interpretation: 'plain' },
    { name: 'badboxesCount', storage: 'number', interpretation: 'plain' },
    { name: 'missingRefsCount', storage: 'number', interpretation: 'plain' },
    { name: 'rawLog', storage: 'text', interpretation: 'plain' },
    { name: 'parsedErrors', storage: 'text', interpretation: 'plain' },
    { name: 'parsedWarnings', storage: 'text', interpretation: 'plain' },
    { name: 'parsedBadboxes', storage: 'text', interpretation: 'plain' },
    { name: 'parsedMissingRefs', storage: 'text', interpretation: 'plain' },
    { name: 'logFiles', storage: 'text', interpretation: 'plain' },
    { name: 'compiledAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: false, create: false, update: false, delete: false },
  },
}
