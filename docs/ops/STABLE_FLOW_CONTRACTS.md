# MIMIGO Servicios - Stable Flow Contracts

These contracts protect flows that are already working. Any future change that
modifies one of these areas must update this file and the related QA script in
the same commit.

## Client request and payment

- The client searches providers, selects an available provider, and confirms a
  service request.
- For priced services, MIMIGO creates the service request first and then creates
  the Mercado Pago payment intent from the persisted request snapshot.
- The client sees the payment action after the request exists.
- `CHECKOUT_CREATED` and `PENDING` are not approved states.
- The UI can say `Pago confirmado` only when the payment status is
  `APPROVED`, `CAPTURED`, or `SETTLED`.
- `QUOTE` or zero-total services do not create immediate payment; they require a
  future internal quote flow before charging.

Protected by:

- `npm run qa:mercadopago-phase1`
- `npm run qa:services-payment-lifecycle`

## Provider service lifecycle

- The provider can receive and accept a request in realtime.
- The provider sees only `Tu precio`; internal commission and customer total are
  not provider-facing operational copy.
- For paid services, accepting the request does not start route/work until the
  payment is approved.
- Backend lifecycle transitions must reject route/start/complete when payment is
  required and not approved.
- PIN validation starts the work only after the payment guard passes.

Protected by:

- `npm run qa:services-payment-lifecycle`

## Provider wallet and payouts

- The provider Wallet reads the provider-visible snapshot from
  `provider_wallets`.
- The fallback dashboard amount uses `provider_price_snapshot`, not
  `total_price_snapshot`.
- Provider-visible available balance is earnings minus risk holds, cash debt,
  payout holds, and paid payouts.
- Creating or updating payout rows recomputes the provider-visible wallet.
- Marking a payout paid must reduce the amount available for future withdrawal.
- Real payout execution remains disabled until an explicit future phase enables
  it.

Protected by:

- `npm run qa:provider-payout-account-foundation`
- `npm run qa:provider-payout-account-ownership`
- `npm run qa:provider-wallet-payout-contract`

## Change rule

Do not edit these flows opportunistically. If a future upgrade needs to touch
them, first describe the intended contract change, then update tests, code, and
this document together. If a test fails, stop and fix the contract regression
before deploying.
