import type { CollectionSchema } from 'deepspace/worker'

export const editorSettingsSchema: CollectionSchema = {
  name: 'editorSettings',
  columns: [
    { name: 'fontSize', storage: 'number', interpretation: 'plain' },
    { name: 'theme', storage: 'text', interpretation: 'plain' },
    { name: 'lineWrapping', storage: 'number', interpretation: 'plain' },
    { name: 'lineNumbers', storage: 'number', interpretation: 'plain' },
    { name: 'compiler', storage: 'text', interpretation: 'plain' },
    { name: 'bibEngine', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    admin: { read: true, create: true, update: true, delete: true },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    viewer: { read: 'own', create: true, update: 'own', delete: false },
  },
}
