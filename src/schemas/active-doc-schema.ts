import type { CollectionSchema } from 'deepspace/worker'

export const activeLatexDocIdSchema: CollectionSchema = {
  name: 'activeLatexDocId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'activeDocumentId', storage: 'text', interpretation: 'plain' },
    { name: 'activeDocumentTitle', storage: 'text', interpretation: 'plain' },
    { name: 'activeFilePath', storage: 'text', interpretation: 'plain' },
    { name: 'updatedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: 'own', create: true, update: 'own', delete: 'own' },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: 'own', create: true, update: 'own', delete: 'own' },
  },
}
