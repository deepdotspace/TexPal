/**
 * useGitHubTemplates — fetches LaTeX templates from GitHub repositories via jsDelivr CDN
 *
 * Supports two template types:
 * - Single-file: one .tex file per template (sara-venkatraman/LaTeX-Templates)
 * - Multi-file: full project with .tex, .cls, .bib, images, etc. (Harsh-Kathiriya/latex)
 */

import { useState, useEffect, useCallback } from 'react'

export interface GitHubTemplate {
  id: string
  name: string
  description: string
  icon: string
  folderName: string
  fileName?: string
  content?: string
  /** Multi-file templates: entry .tex file path relative to folder */
  mainTexFile?: string
  isMultiFile?: boolean
}

export interface TemplateFileSet {
  mainTexPath: string
  files: Array<{
    path: string
    content?: string
    base64Content?: string
  }>
}

// Single-file templates (sara-venkatraman/LaTeX-Templates)
const GITHUB_REPO = 'sara-venkatraman/LaTeX-Templates'
const GITHUB_BRANCH = 'master'
const GITHUB_CDN = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${GITHUB_BRANCH}`

// Multi-file templates (Harsh-Kathiriya/latex)
const LATEX_REPO = 'Harsh-Kathiriya/latex'
const LATEX_BRANCH = 'main'
const LATEX_CDN = `https://cdn.jsdelivr.net/gh/${LATEX_REPO}@${LATEX_BRANCH}`
const LATEX_DATA_API = `https://data.jsdelivr.com/v1/packages/gh/${LATEX_REPO}@${LATEX_BRANCH}`
const GITHUB_RAW = `https://cdn.jsdelivr.net/gh/${LATEX_REPO}@${LATEX_BRANCH}`

// Files to skip when loading multi-file templates (guides, generated, duplicates)
const SKIP_FILES = new Set([
  'README.txt',
  'acmguide.pdf',
  'IEEEtran_HOWTO.pdf',
  'IEEE-conference-template-062824.pdf',
  'sampleteaser.pdf',
  'Crossmark.pdf',
])
const SKIP_EXTENSIONS = new Set(['.synctex.gz'])

// ACM Conference: only include sample-sigconf.tex (not -authordraft, -biblatex, -xelatex, etc.)
const ACM_CONF_VARIANT_SUFFIXES = ['-authordraft', '-biblatex', '-xelatex', '-lualatex', '-i13n']

function shouldSkipFile(path: string, folderName: string): boolean {
  const baseName = path.split('/').pop() || ''
  if (SKIP_FILES.has(baseName)) return true
  const lower = path.toLowerCase()
  for (const ext of SKIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  // Skip ACM Conference variant .tex files (keep only sample-sigconf.tex)
  if (folderName === 'ACM_Conference_Proceedings_Primary_Article_Template' && baseName.endsWith('.tex')) {
    if (baseName === 'sample-sigconf.tex') return false
    if (ACM_CONF_VARIANT_SUFFIXES.some(s => baseName.includes(s))) return true
  }
  return false
}

// Single-file templates (sara-venkatraman/LaTeX-Templates)
const SINGLE_FILE_TEMPLATES: Omit<GitHubTemplate, 'content'>[] = [
  { id: 'cv-version-1', name: 'CV Version 1', description: 'Clean single-page CV template', icon: 'User', folderName: 'CV - Version 1', fileName: 'CVTemplate1.tex' },
  { id: 'cv-version-2', name: 'CV Version 2', description: 'Alternative CV template layout', icon: 'User', folderName: 'CV - Version 2', fileName: 'CVTemplate2.tex' },
  { id: 'essay', name: 'Essay', description: 'Academic essay template with proper formatting', icon: 'FileText', folderName: 'Essay', fileName: 'EssayTemplate.tex' },
  { id: 'homework', name: 'Homework / Assignment', description: 'Problem-solution format with math packages', icon: 'BookOpen', folderName: 'Homework', fileName: 'HomeworkTemplate.tex' },
  { id: 'presentation', name: 'Beamer Presentation', description: 'Slide deck with title and content slides', icon: 'Presentation', folderName: 'Presentation', fileName: 'PresentationTemplate.tex' },
]

// Multi-file templates from Harsh-Kathiriya/latex — ordered by likelihood of use
const MULTI_FILE_TEMPLATES: Omit<GitHubTemplate, 'content'>[] = [
  { id: 'jakes-resume', name: 'Resume', description: 'Professional resume template', icon: 'User', folderName: "Jake's Resume", mainTexFile: 'main.tex', isMultiFile: true },
  { id: 'gatech-thesis', name: 'Academic Thesis', description: 'Multi-chapter thesis template', icon: 'GraduationCap', folderName: 'Georgia_Tech_Thesis_Template_06_26_2024', mainTexFile: 'thesis.tex', isMultiFile: true },
  { id: 'acm-conference', name: 'ACM Conference', description: 'ACM conference proceedings template', icon: 'GraduationCap', folderName: 'ACM_Conference_Proceedings_Primary_Article_Template', mainTexFile: 'sample-sigconf.tex', isMultiFile: true },
  { id: 'ieee-conference', name: 'IEEE Conference', description: 'IEEE conference paper template', icon: 'FileText', folderName: 'IEEE-conference-template-062824', mainTexFile: 'IEEE-conference-template-062824.tex', isMultiFile: true },
  { id: 'acm-journal', name: 'ACM Journal', description: 'ACM journal manuscript template', icon: 'GraduationCap', folderName: 'ACM_Journals_Primary_Article_Template', mainTexFile: 'sample-manuscript.tex', isMultiFile: true },
  { id: 'apa7', name: 'APA7 Format', description: 'APA 7th edition LaTeX starter', icon: 'FileText', folderName: 'APA7_Format_LaTeX_Starter', mainTexFile: 'shortsample.tex', isMultiFile: true },
  { id: 'icck-journal', name: 'ICCK Journal', description: 'ICCK journal article template', icon: 'FileText', folderName: 'ICCK_LaTex_Template', mainTexFile: 'mauscript.tex', isMultiFile: true },
  { id: 'newspaper', name: 'Newspaper / Newsletter', description: 'Newspaper-style newsletter template', icon: 'FileText', folderName: 'Newspaper_news_letter_template', mainTexFile: 'newspaperExample.tex', isMultiFile: true },
]

// Order: Resume, CV, Thesis, Research papers first, then rest
const TEMPLATES: Omit<GitHubTemplate, 'content'>[] = [
  MULTI_FILE_TEMPLATES[0], // Resume
  ...SINGLE_FILE_TEMPLATES.filter(t => t.id.startsWith('cv-')), // CV Version 1, 2
  MULTI_FILE_TEMPLATES[1], // Academic Thesis
  MULTI_FILE_TEMPLATES[2], // ACM Conference
  MULTI_FILE_TEMPLATES[3], // IEEE Conference
  MULTI_FILE_TEMPLATES[4], // ACM Journal
  ...SINGLE_FILE_TEMPLATES.filter(t => !t.id.startsWith('cv-')), // Essay, Homework, Presentation
  ...MULTI_FILE_TEMPLATES.slice(5), // APA7, ICCK, Newspaper
]

const TEXT_EXTENSIONS = new Set(['.tex', '.cls', '.bst', '.bib', '.sty', '.bbx', '.cbx', '.dbx', '.txt'])
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf'])

function getExtension(path: string): string {
  const lower = path.toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return lower.slice(dotIndex)
}

function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(path))
}

function isBinaryFile(path: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(path))
}

/** Recursively collect all file paths from jsDelivr directory structure */
function collectFilePaths(dir: { type: string; name: string; files?: any[] }, prefix: string): string[] {
  const paths: string[] = []
  if (dir.type === 'file') {
    paths.push(prefix ? `${prefix}/${dir.name}` : dir.name)
    return paths
  }
  if (dir.type === 'directory' && dir.files) {
    for (const f of dir.files) {
      paths.push(...collectFilePaths(f, prefix ? `${prefix}/${dir.name}` : dir.name))
    }
  }
  return paths
}

/** Fetch file manifest from jsDelivr data API */
async function fetchManifest(): Promise<{ type: string; name: string; files?: any[] }[]> {
  const res = await fetch(LATEX_DATA_API)
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
  const data = (await res.json()) as { files?: { type: string; name: string; files?: any[] }[] }
  return data.files ?? []
}

/** Fetch text file content from CDN */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  return res.text()
}

/** Fetch binary file as base64 */
async function fetchBinaryAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function fetchTemplateContent(folderName: string, fileName: string): Promise<string> {
  const cdnUrl = `${GITHUB_CDN}/${folderName}/${fileName}`
  return fetchText(cdnUrl)
}

export function useGitHubTemplates() {
  const [templates, setTemplates] = useState<GitHubTemplate[]>(TEMPLATES as GitHubTemplate[])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(false)
  }, [])

  const loadTemplateContent = useCallback(async (templateId: string): Promise<string> => {
    const template = templates.find(t => t.id === templateId)
    if (!template) throw new Error(`Template not found: ${templateId}`)
    if (template.isMultiFile) {
      throw new Error(`Template "${template.name}" is multi-file. Use loadTemplateFiles instead.`)
    }
    if (template.content) return template.content
    const content = await fetchTemplateContent(template.folderName, template.fileName!)
    setTemplates(prev => prev.map(t => (t.id === templateId ? { ...t, content } : t)))
    return content
  }, [templates])

  const loadTemplateFiles = useCallback(async (templateId: string): Promise<TemplateFileSet | null> => {
    const template = templates.find(t => t.id === templateId)
    if (!template || !template.isMultiFile || !template.mainTexFile) return null

    const folderName = template.folderName
    const mainTexPath = template.mainTexFile

    const manifest = await fetchManifest()
    const folderDir = manifest.find((d: any) => d.type === 'directory' && d.name === folderName)

    // Fallback: if folder not in manifest (e.g. jsDelivr cache delay), try direct fetch from CDN or GitHub raw
    if (!folderDir || !folderDir.files) {
      const encodedFolder = encodeURIComponent(folderName)
      const cdnUrl = `${LATEX_CDN}/${encodedFolder}/${mainTexPath}`
      const rawUrl = `${GITHUB_RAW}/${encodedFolder}/${mainTexPath}`
      try {
        const content = await fetchText(cdnUrl)
        return { mainTexPath, files: [{ path: mainTexPath, content }] }
      } catch {
        try {
          const content = await fetchText(rawUrl)
          return { mainTexPath, files: [{ path: mainTexPath, content }] }
        } catch {
          throw new Error(`Template folder not found: ${folderName}`)
        }
      }
    }

    const allPaths: string[] = []
    for (const f of folderDir.files) {
      allPaths.push(...collectFilePaths(f, ''))
    }

    const filesToLoad = allPaths.filter(p => {
      if (shouldSkipFile(p, folderName)) return false
      return isTextFile(p) || isBinaryFile(p)
    })

    const encodedFolder = encodeURIComponent(folderName)
    const baseUrl = `${LATEX_CDN}/${encodedFolder}`
    const files: TemplateFileSet['files'] = []

    for (const relPath of filesToLoad) {
      const url = `${baseUrl}/${relPath.split('/').map(encodeURIComponent).join('/')}`
      try {
        if (isTextFile(relPath)) {
          const content = await fetchText(url)
          files.push({ path: relPath, content })
        } else if (isBinaryFile(relPath)) {
          const base64Content = await fetchBinaryAsBase64(url)
          files.push({ path: relPath, base64Content })
        }
      } catch (err) {
        console.warn(`Skipping ${relPath}:`, err)
      }
    }

    return { mainTexPath, files }
  }, [templates])

  return {
    templates,
    loading,
    error,
    loadTemplateContent,
    loadTemplateFiles,
  }
}
