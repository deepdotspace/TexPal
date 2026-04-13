import type { CollectionSchema } from 'deepspace/worker'

export const documentVersionsSchema: CollectionSchema = {
  name: 'documentVersions',
  columns: [
    { name: 'documentId', storage: 'text', interpretation: 'plain' },
    { name: 'pdfUrl', storage: 'text', interpretation: 'plain' },
    { name: 'pdfKey', storage: 'text', interpretation: 'plain' },
    { name: 'latexSource', storage: 'text', interpretation: 'plain' },
    { name: 'compiler', storage: 'text', interpretation: 'plain' },
    { name: 'compiledAt', storage: 'number', interpretation: 'plain' },
    { name: 'versionNum', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: false, delete: true },
    member: { read: 'own', create: true, update: false, delete: 'own' },
    viewer: { read: false, create: false, update: false, delete: false },
  },
}
