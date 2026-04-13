import type { CollectionSchema } from 'deepspace/worker'

export const agentEditsSchema: CollectionSchema = {
  name: 'agentEdits',
  columns: [
    { name: 'documentId', storage: 'text', interpretation: 'plain' },
    { name: 'filePath', storage: 'text', interpretation: 'plain' },
    { name: 'newContent', storage: 'text', interpretation: 'plain' },
    { name: 'newContentBase64', storage: 'text', interpretation: 'plain' },
    { name: 'action', storage: 'text', interpretation: 'plain' },
    { name: 'newPath', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'errorMessage', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: false, create: false, update: false, delete: false },
  },
}
