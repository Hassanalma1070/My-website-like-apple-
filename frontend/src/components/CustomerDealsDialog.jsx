import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Modal from './Modal.jsx'
import DealsTable from './DealsTable.jsx'
import { useDealActions } from './useDealActions.jsx'
import { PlusIcon } from './Icons.jsx'

// One customer's deals: list, add, edit, change stage and delete
export default function CustomerDealsDialog({ customer, notify, onChanged, onClose }) {
  const [deals, setDeals] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setDeals(await api.getCustomerDeals(customer.customer_id))
    } catch (err) {
      setError(err.message)
    }
  }, [customer.customer_id])

  useEffect(() => {
    load()
  }, [load])

  const actions = useDealActions({
    notify,
    customerId: customer.customer_id,
    onChanged: () => {
      load()
      onChanged()
    },
  })

  // Only one modal at a time: hide this one while the deal form or delete confirmation is open
  if (actions.dialogOpen) return actions.dialogs

  return (
    <Modal
      title={`Deals · ${customer.name}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={actions.add}><PlusIcon /> Add deal</button>
        </>
      }
    >
      {error ? (
        <p className="alert alert-error">{error}</p>
      ) : !deals ? (
        <p className="muted">Loading…</p>
      ) : deals.length === 0 ? (
        <p className="muted">No deals for this customer yet.</p>
      ) : (
        <div className="table-wrap table-wrap-flush">
          <DealsTable deals={deals} actions={actions} showCustomer={false} />
        </div>
      )}
    </Modal>
  )
}
