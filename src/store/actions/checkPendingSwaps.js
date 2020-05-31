import { NetworkAssets } from '../factory/client'

const PENDING_STATES = [
  'SECRET_READY',
  'INITIATED',
  'WAITING_FOR_CONFIRMATIONS',
  'INITIATION_REPORTED',
  'READY_TO_EXCHANGE',
  'GET_REFUND',
  'READY_TO_SEND'
]

export const checkPendingSwaps = async ({ state, dispatch }) => {
  Object.keys(NetworkAssets).forEach(network => {
    if (!state.history[network]) return

    Object.keys(state.history[network]).forEach(walletId => {
      state.history[network][walletId].forEach(order => {
        if (order.type !== 'SWAP') return

        if (PENDING_STATES.includes(order.status)) {
          dispatch('performNextAction', { network, walletId, id: order.id })
        }
      })
    })
  })
}