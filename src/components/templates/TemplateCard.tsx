import React from 'react'

/** Template display props (StarterTemplate | GitHubTemplate) */
interface TemplateDisplay {
  id: string
  name: string
  description: string
  icon: string
}

const ICON_PATHS: Record<string, string> = {
  FileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  GraduationCap: 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  User: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  Mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  BookOpen: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  Presentation: 'M2 3h20 M10 11l4 3-4 3 M2 3v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V3',
}

function TemplateIcon({ icon }: { icon: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(ICON_PATHS[icon] || ICON_PATHS.FileText).split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

interface TemplateCardProps {
  template: TemplateDisplay
  onSelect: (template: TemplateDisplay) => void
  disabled?: boolean
}

export function TemplateCard({ template, onSelect, disabled }: TemplateCardProps) {
  return (
    <button
      className="template-card text-left group"
      onClick={() => onSelect(template)}
      disabled={disabled}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-accent-light dark:bg-accent/20 flex items-center justify-center text-accent dark:text-accent-muted shrink-0 group-hover:bg-accent group-hover:text-white transition-colors duration-200">
          <TemplateIcon icon={template.icon} />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-content text-sm truncate">{template.name}</div>
        </div>
      </div>
      <p className="text-xs text-content-secondary leading-relaxed">{template.description}</p>
    </button>
  )
}
