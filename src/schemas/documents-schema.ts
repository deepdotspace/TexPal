import type { CollectionSchema } from 'deepspace/worker'

export const documentsSchema: CollectionSchema = {
  name: 'documents',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'templateId', storage: 'text', interpretation: 'plain' },
    { name: 'lastCompiledAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: false, create: false, update: false, delete: false },
  },
}
