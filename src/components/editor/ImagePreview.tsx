/**
 * ImagePreview — displays image files in the editor area
 */

import React from 'react'

interface ImagePreviewProps {
  fileName: string
  base64Content?: string
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.eps']

export function isImageFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext))
}

export function ImagePreview({ fileName, base64Content }: ImagePreviewProps) {
  if (!isImageFile(fileName)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-editor-bg">
        <div className="text-content-secondary text-sm">Not an image file</div>
      </div>
    )
  }

  if (!base64Content) {
    return (
      <div className="flex-1 flex items-center justify-center bg-editor-bg">
        <div className="text-center">
          <div className="text-content-secondary text-sm mb-2">No image data available</div>
          <div className="text-content-tertiary text-xs">This image file has no content</div>
        </div>
      </div>
    )
  }

  // Handle base64Content - it might be a full data URL or just base64 string
  let imageSrc: string
  if (base64Content.startsWith('data:')) {
    // Already a data URL, use it directly
    imageSrc = base64Content
  } else {
    // Just base64 string, construct data URL
    const getMimeType = (name: string): string => {
      const lowerName = name.toLowerCase()
      if (lowerName.endsWith('.png')) return 'image/png'
      if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
      if (lowerName.endsWith('.gif')) return 'image/gif'
      if (lowerName.endsWith('.svg')) return 'image/svg+xml'
      if (lowerName.endsWith('.eps')) return 'application/postscript'
      return 'image/png' // default
    }
    const mimeType = getMimeType(fileName)
    imageSrc = `data:${mimeType};base64,${base64Content}`
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-editor-bg overflow-auto p-4">
      <div className="max-w-full max-h-full flex items-center justify-center">
        <img
          src={imageSrc}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    </div>
  )
}
