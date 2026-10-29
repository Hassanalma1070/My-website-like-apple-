import { useExport } from '../useExport.js'
import { DownloadIcon, RefreshIcon } from './Icons.jsx'

// Exports one category with the filters currently on screen
export default function ExportButton({ category, filters = {}, notify }) {
  const { busy, run } = useExport(notify)
  return (
    <button className="btn btn-ghost" onClick={() => run({ categories: [category], ...filters })} disabled={busy}>
      {busy ? <><RefreshIcon className="spin" /> Preparing export…</> : <><DownloadIcon /> Export to Excel</>}
    </button>
  )
}
