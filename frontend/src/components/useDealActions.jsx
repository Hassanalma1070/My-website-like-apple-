import { useState } from 'react'
import { api } from '../api.js'
import Modal from './Modal.jsx'
import DealForm from './DealForm.jsx'

// Add, edit, stage change and delete for deals, shared by the Deals screen and the customer's deals dialog.
// Returns the handlers plus `dialogs` (the form or the delete confirmation) to render.
export function useDealActions({ notify, onChanged, customers, customerId }) {
  const [editing, setEditing] = useState(null) // null | 'new' | deal
  const [deleting, setDeleting] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function save(body) {
    if (editing === 'new') {
      const created = await api.createDeal(body)
      notify(`Deal “${created.title}” created`)
    } else {
      const updated = await api.updateDeal(editing.deal_id, body)
      notify(`Deal “${updated.title}” updated`)
    }
    setEditing(null)
    onChanged()
  }

  async function changeStage(deal, stage) {
    setBusyId(deal.deal_id)
    try {
      await api.updateDeal(deal.deal_id, { stage })
      notify(`“${deal.title}” moved to ${stage}`)
      onChanged()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    setBusyId(deleting.deal_id)
    try {
      await api.deleteDeal(deleting.deal_id)
      notify(`Deal “${deleting.title}” deleted`)
      setDeleting(null)
      onChanged()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const dialogs = (
    <>
      {editing && (
        <DealForm
          deal={editing === 'new' ? null : editing}
          customers={customers}
          customerId={customerId}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Modal
          title="Delete deal"
          onClose={() => busyId === null && setDeleting(null)}
          width={420}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDeleting(null)} disabled={busyId !== null}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busyId !== null}>
                {busyId !== null ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>Delete the deal <strong>{deleting.title}</strong>? This can’t be undone.</p>
        </Modal>
      )}
    </>
  )

  return {
    busyId,
    // While a form or confirmation is open, a surrounding dialog should hide so only one modal shows
    dialogOpen: Boolean(editing || deleting),
    add: () => setEditing('new'),
    edit: setEditing,
    remove: setDeleting,
    changeStage,
    dialogs,
  }
}
