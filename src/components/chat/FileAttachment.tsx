import React from 'react'
import { FileText } from 'lucide-react'
import { formatBytes } from '../../lib/utils'

interface FileAttachmentProps {
  url: string
  meta?: string
}

export const FileAttachment: React.FC<FileAttachmentProps> = ({ url, meta }) => {
  let name = 'file'
  let size = 0
  let type = ''
  try {
    const parsed = meta ? JSON.parse(meta) : {}
    name = parsed.name || name
    size = parsed.size || size
    type = parsed.type || type
  } catch {
    // ignore
  }

  const preview = type === 'application/pdf' || type.startsWith('text/')

  return (
    <div className="mt-1 max-w-xs">
      {preview && (
        <iframe
          src={url}
          title={name}
          className="w-full h-48 rounded border mb-2"
        />
      )}
      <div className="flex items-center space-x-2">
        <FileText className="w-4 h-4 flex-shrink-0" />
        <a href={url} download className="text-blue-600 underline break-all">
          {name}
        </a>
        {size > 0 && (
          <span className="text-xs text-gray-500">({formatBytes(size)})</span>
        )}
        {!preview && type && (
          <span className="text-xs text-gray-500">{type}</span>
        )}
      </div>
    </div>
  )
}
