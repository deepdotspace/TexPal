import type { CollectionSchema } from 'deepspace/worker'

export const projectFilesSchema: CollectionSchema = {
  name: 'projectFiles',
  columns: [
    { name: 'documentId', storage: 'text', interpretation: 'plain' },
    { name: 'path', storage: 'text', interpretation: 'plain' },
    { name: 'fileType', storage: 'text', interpretation: 'plain' },
    { name: 'plainContent', storage: 'text', interpretation: 'plain' },
    { name: 'agentRevision', storage: 'number', interpretation: 'plain' },
    { name: 'base64Content', storage: 'text', interpretation: 'plain' },
    { name: 'isEntryFile', storage: 'number', interpretation: 'plain' },
    { name: 'deletedAt', storage: 'number', interpretation: 'plain' },
    { name: 'originalPath', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: false, create: false, update: false, delete: false },
  },
}
