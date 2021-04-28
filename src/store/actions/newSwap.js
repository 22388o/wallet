import { newOrder } from '../utils'
import { withLock } from './performNextAction/utils'
import { hasQuoteExpired } from './performNextAction/swap'
import { sha256 } from '@liquality/crypto'

async function initiateSwap ({ getters }, { order, network, walletId }) {
  if (await hasQuoteExpired({ getters }, { network, walletId, order })) {
    throw new Error('The quote is expired')
  }

  const account = getters.accountItem(order.fromAccountId)
  const fromClient = getters.client(network, walletId, order.from, account?.type)

  const message = [
    'Creating a swap with following terms:',
    `Send: ${order.fromAmount} (lowest denomination) ${order.from}`,
    `Receive: ${order.toAmount} (lowest denomination) ${order.to}`,
    `My ${order.from} Address: ${order.fromAddress}`,
    `My ${order.to} Address: ${order.toAddress}`,
    `Counterparty ${order.from} Address: ${order.fromCounterPartyAddress}`,
    `Counterparty ${order.to} Address: ${order.toCounterPartyAddress}`,
    `Timestamp: ${order.swapExpiration}`
  ].join('\n')

  const messageHex = Buffer.from(message, 'utf8').toString('hex')
  const secret = await fromClient.swap.generateSecret(messageHex)
  const secretHash = sha256(secret)

  const fromFundTx = await fromClient.swap.initiateSwap(
    order.fromAmount,
    order.fromCounterPartyAddress,
    order.fromAddress,
    secretHash,
    order.swapExpiration,
    order.fee
  )

  return {
    secret,
    secretHash,
    fromFundHash: fromFundTx.hash,
    fromFundTx
  }
}

export const newSwap = async (
  store,
  {
    network,
    walletId,
    agent,
    from,
    to,
    fromAmount,
    sendTo,
    fee,
    claimFee,
    fromAccountId,
    toAccountId
  }) => {
  const order = await newOrder(agent, {
    from,
    to,
    fromAmount
  })

  let [fromAddress] = await store.dispatch('getUnusedAddresses', { network, walletId, assets: [order.from], accountId: order.fromAccountId })
  let [toAddress] = await store.dispatch('getUnusedAddresses', { network, walletId, assets: [order.to], accountId: order.toAccountId })

  fromAddress = fromAddress.toString()
  toAddress = toAddress.toString()
  order.fromAddress = fromAddress
  order.toAddress = toAddress

  order.type = 'SWAP'
  order.network = network
  order.agent = agent
  order.startTime = Date.now()
  order.status = 'QUOTE'
  order.sendTo = sendTo
  order.walletId = walletId
  order.fee = fee
  order.claimFee = claimFee
  order.fromAccountId = fromAccountId
  order.toAccountId = toAccountId

  const initiatedOrder = await withLock(store, { item: order, network, walletId, asset: order.from },
    async () => initiateSwap(store, { order, network, walletId }))

  const createdOrder = {
    ...order,
    ...initiatedOrder
  }

  console.log('createdOrder', createdOrder)
  store.commit('NEW_ORDER', { network, walletId, order: createdOrder })

  store.dispatch('performNextAction', { network, walletId, fromAccountId, toAccountId, id: order.id })

  return order
}
