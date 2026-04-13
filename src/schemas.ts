/**
 * Collection Schemas — TeXPal LaTeX Editor
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 */

import type { CollectionSchema } from 'deepspace/worker'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { documentsSchema } from './schemas/documents-schema'
import { projectFilesSchema } from './schemas/project-files-schema'
import { compilationLogsSchema } from './schemas/compilation-logs-schema'
import { editorSettingsSchema } from './schemas/editor-settings-schema'
import { documentVersionsSchema } from './schemas/document-versions-schema'
import { activeLatexDocIdSchema } from './schemas/active-doc-schema'
import { agentEditsSchema } from './schemas/agent-edits-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  documentsSchema,
  projectFilesSchema,
  compilationLogsSchema,
  editorSettingsSchema,
  documentVersionsSchema,
  activeLatexDocIdSchema,
  agentEditsSchema,
]
