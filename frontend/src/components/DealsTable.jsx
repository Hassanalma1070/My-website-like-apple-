import { formatDay, formatINR, isOverdue } from '../money.js'
import { OverdueBadge, StageSelect } from './Stage.jsx'
import { EditIcon, TrashIcon } from './Icons.jsx'

// Deals with an inline stage select and edit / delete actions
export default function DealsTable({ deals, actions, showCustomer = true }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Deal</th>
          {showCustomer && <th>Customer</th>}
          <th className="right">Amount</th>
          <th>Stage</th>
          <th>Expected close</th>
          <th className="right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((d) => (
          <tr key={d.deal_id}>
            <td>
              <div className="person-name">{d.title}</div>
              <div className="muted small">#{d.deal_id}</div>
            </td>
            {showCustomer && <td>{d.customer_name}</td>}
            <td className="right count">{formatINR(d.amount)}</td>
            <td>
              <StageSelect
                value={d.stage}
                onChange={(stage) => actions.changeStage(d, stage)}
                disabled={actions.busyId === d.deal_id}
                label={`Stage of ${d.title}`}
              />
            </td>
            <td className="nowrap">
              <span className={isOverdue(d) ? 'overdue-date' : 'muted'}>{formatDay(d.expected_close_date)}</span>
              {isOverdue(d) && <> <OverdueBadge /></>}
            </td>
            <td className="right">
              <div className="row-actions">
                <button className="icon-btn" onClick={() => actions.edit(d)} aria-label={`Edit ${d.title}`} title="Edit"><EditIcon /></button>
                <button className="icon-btn danger" onClick={() => actions.remove(d)} aria-label={`Delete ${d.title}`} title="Delete"><TrashIcon /></button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
