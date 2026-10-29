import { useCallback, useState } from 'react'
import { api } from './api.js'

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before releasing the blob
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Runs one export at a time, saves the file and reports the result with a toast.
// Resolves to true on success.
export function useExport(notify) {
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (params) => {
    setBusy(true)
    try {
      const { blob, fileName, rows } = await api.exportData(params)
      saveBlob(blob, fileName)
      notify(`Exported ${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'} to ${fileName}`)
      return true
    } catch (err) {
      notify(err.message, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }, [notify])

  return { busy, run }
}
