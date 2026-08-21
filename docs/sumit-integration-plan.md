# SUMIT integration — implementation plan

Written 2026-08-21, against a live read-only probe of the real account
(`npm run sumit:probe`, or Settings → Data → Run SUMIT probe). Every
number below came out of that probe rather than an assumption, and the
probe stays in the repo so any claim here can be re-checked.

## What the account actually holds

93 documents, **23 June → 20 August 2026** — SUMIT has been in use for two
months, so there is no deep history to migrate.

| type | means | count | value |
|---|---|---|---|
| InvoiceAndReceipt | revenue | 38 | ₪27,597 |
| Invoice | revenue | 24 | ₪30,405 |
| Receipt | collection | 12 | ₪14,699 |
| PaymentRequest | collection | 6 | ₪8,615 |
| CreditInvoice | revenue | 5 | −₪4,745 |
| ProformaInvoice | quote | 4 | ₪2,409 |
| DeliveryNote | logistics | 3 | ₪8,118 |
| CreditInvoiceAndReceipt | revenue | 1 | −₪1,000 |

**Billed revenue is ₪52,257** — the revenue bucket only. Summing every
non-expense document counts the same money twice, since a Receipt pays an
Invoice already counted, and a DeliveryNote or PaymentRequest is not
income at all. `documentBucket` in `sumit.ts` states that once.

**56 customers** appear across those documents; the `לקוחות` CRM folder
holds 59. They carry `Customers_FullName` and often
`Customers_EmailAddress`, sometimes a saved credit card
(`Billing_PaymentMethods`) — and **no phone**.

**There are no expenses in SUMIT.** Not "none the API will show": none.
All seven expense document types return zero, with and without a date
filter; `הוצאות`, `פריטי הוצאות` and `חשבוניות ספקים` are empty; and the
78 entities in `קבצי הוצאות` are photographs — insert date, books date,
source, the sending phone, a status, and a JPEG. No supplier, no amount,
no VAT, and no link to any document made from them (the same probe *does*
see such links on customer records, so absence here is real). Confirmed
independently against SUMIT's own screens on 2026-08-21.

## What the API allows, and what it doesn't

- **Customers**: `create` (with `SearchMode`, so find-or-create), `update`,
  `getdetailsurl`. **No list and no search** — so Jimgem must own the
  client list and store the `CustomerID` SUMIT returns. A roster can only
  be *reconstructed*, from documents or the CRM folder.
- **Documents**: `list` filters by type, number and date **only** — no
  customer filter, no "modified since". So per-client views bucket a
  window locally, and sync means a window plus upsert on `DocumentID`.
  Each row carries `CustomerID`, `Type`, `DocumentValue`/`CompanyValue`,
  `IsClosed`, `DocumentDownloadURL` and **`DocumentPaymentURL`**.
- **Money**: `billing/payments/beginredirect` returns a hosted payment
  page and takes an `ExternalIdentifier` — the only way to tie a payment
  back to a Jimgem order. `payments/charge` charges a stored card.
- **Debt**: `getdebt` and `getdebtreport` are **per customer**, never per
  order. Real per-order attribution exists only for documents Jimgem
  itself created or linked.
- **Webhooks**: `triggers/subscribe` is CRM folder/view based, built for
  Make and Zapier — nothing usable for accounting documents. Sync is
  therefore polled.
- `SupplierPayment` is in the type enum but `documents/list` rejects it,
  and one bad type fails the whole request — so expense types are asked
  for individually.

## Decisions, and why

- **Clients are a Jimgem table, not a view over `orders.customer`.**
  SUMIT can't be searched, so the link has to be stored somewhere, and
  `sumit_customer_id` needs a row to live on.
- **`orders.customer` stays free text** beside the new `client_id`, the
  same rule `customer_type` follows: a Sheet import must never be
  rejected by a value not on a list.
- **Phone is the key going forward, names only for history.** Of 73
  distinct order names, 13 match a SUMIT customer exactly and 13 more
  loosely (`פנטרה` → `פנטרה אבטחת מידע`, `כרמלה` → `ח.נ.י כרמלה למסחר`).
  A loose match is *proposed*, never applied: the rest are mostly
  pre-June orders that were never going to match.
- **Nothing about money is overwritten silently.** Where SUMIT disagrees
  with a hand-set payment status, both are shown and the row is flagged.
  A wrong automatic status on a paid order is worse than no automatic
  status.
- **Draft-first for tax documents.** Invoices and receipts are created as
  drafts for approval in SUMIT (`IsDraft` + `movetobooks`).
  `PaymentRequest` is exempt: it books nothing, so it can be issued for
  real.
- **Whether a value is gross or net is established, never assumed.**
  `DocumentValue` and `CompanyValue` name no convention, and guessing puts
  an 18% error through every comparison with nothing looking broken. The
  probe now samples three documents, adds each one's line totals and its
  separately-stated VAT, and compares both against the reported value —
  and asks `getvatrate` for the company's own rate instead of assuming the
  statutory one. Whatever it reports is what the mirror stores, recorded
  here once settled.

## Phase 1

### 1a — Clients

```sql
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  sumit_customer_id BIGINT UNIQUE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES clients(id);
```

`scripts/migrate-014-clients.mjs` creates one client per distinct
normalized order name and links every order to it. Archived, never
deleted, like every other owner-managed list.

**The order form's customer field becomes a client picker** — type a
name, pick an existing client or create one with a phone. This is the
largest single change in phase 1 and everything else depends on it.

**Linking to SUMIT**: exact normalized name auto-links; loose matches are
listed for one-click confirmation in Settings → Data; everything else
stays unlinked until it transacts. On saving an order for a client with a
phone and no `sumit_customer_id`, `customers/create` with
`SearchMode: Phone` finds or creates, and the returned ID is stored.
Email is the fallback key, since SUMIT already holds emails.

### 1b — Document mirror

```sql
CREATE TABLE sumit_documents (
  document_id BIGINT PRIMARY KEY,
  document_number BIGINT,
  type TEXT NOT NULL,
  bucket TEXT NOT NULL,
  date DATE,
  due_date DATE,
  sumit_customer_id BIGINT,
  client_id INTEGER REFERENCES clients(id),
  order_id INTEGER REFERENCES orders(id),
  customer_name TEXT,
  value NUMERIC(12,2),
  is_closed BOOLEAN,
  is_draft BOOLEAN,
  download_url TEXT,
  payment_url TEXT,
  external_reference TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`src/lib/sumitSync.ts` is the only module that imports `sumit.ts`, the
same structural rule that keeps the Google Sheet off render paths. It
pulls a rolling window (90 days by default, full history on demand),
upserts on `document_id`, and resolves `client_id` through
`sumit_customer_id`. A nightly Vercel cron plus a **Sync now** button; no
render path ever calls SUMIT.

### 1c — Clients page

A shallow analytics band, then the list gets the page:

- **Four tiles**: clients (active/total), repeat rate, average client
  value, outstanding balance.
- **One chart**: new vs returning orders over time, two series from
  `SERIES_COLORS`. Beside it, a compact top-clients strip.
- **The list**: name, phone, event-type chip, orders, total spent, last
  order, balance. Sorted by last order; row hover goes black like every
  other line in the app.
- **A client**: contact, every order, every SUMIT document with its PDF
  link, balance from `getdebt`, and a link out to SUMIT via
  `getdetailsurl`.

### 1d — Payment status, derived

`InvoiceAndReceipt` and `Receipt` mean paid outright. `Invoice`,
`ProformaInvoice` and `PaymentRequest` are paid when `IsClosed`. Per-order
where a document is linked to the order; per-client from `getdebt`
otherwise. The manual status is kept and the disagreement is shown.

### 1e — Pay link

`beginredirect` with `ExternalIdentifier` set to the Jimgem order id,
which is what makes the payment identifiable when it lands. A **Copy pay
link** button on the order; mirrored documents also expose their own
`DocumentPaymentURL`. This is phase 1's only write to SUMIT, and only on
a button press.

### 1f — Booked vs billed

July ₪24,664 booked / ₪27,897 billed. August ₪17,308 / ₪13,080, still in
progress. **June is not a gap**: SUMIT went live on 23 June, so only the
last week of that month was ever invoiced through it — ₪21,549 booked
against ₪11,281 billed is the changeover, not missed invoicing.

A panel on the Biz Plan comparing the two per month, plus the list that
matters — booked orders with no revenue document against them. From July
onward the comparison is honest; June is annotated as partial rather than
flagged, or the view cries wolf on its first screen.

## VAT on an order

Independent of SUMIT, and worth doing first: an order needs to say how
VAT applies to it, because three different things are true of different
orders and today the schema can express none of them.

```sql
ALTER TABLE orders ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE orders ADD COLUMN vat_rate NUMERIC(5,4);
```

- **`added`** — the price is before VAT, and VAT goes on top.
- **`included`** — the price is what the customer pays, VAT already inside.
- **`exempt`** — no VAT applies.

`vat_rate` is **copied onto the order** when it is created, not looked up
at read time — the same copy-not-link rule a preset's price follows. Rates
change; an order booked at one rate must not silently reprice when the
country changes the other.

The arithmetic lives beside the rest of the money in `orderTypes.ts`:

| mode | net | VAT | total |
|---|---|---|---|
| `added` | subtotal − discount | net × rate | net + VAT |
| `included` | total − VAT | total − total ÷ (1 + rate) | subtotal − discount |
| `exempt` | subtotal − discount | 0 | net |

**`orderTotal` keeps meaning what the customer pays**, so the rail, the
Kanban card and the hover card need no changes. A new `orderNet` is what
the Biz Plan reports, because VAT collected is not income — and that
distinction is exactly what makes a reconciliation against SUMIT line up
or not. The money rail gains one line: the VAT amount, or "VAT included".

The default mode and the rate live in Settings, and the rate can be
prefilled from SUMIT's `getvatrate`.

**The back catalogue is settled**: the business registered when it started
using SUMIT, so `scripts/migrate-015-order-vat.mjs` stamps orders dated
before **2026-06-23** as `exempt` and everything from that date on as
`included`. The boundary is imperfect on purpose — `orders.date` is the
*event* date, not the invoice date, so an event in July quoted in May
lands on the wrong side. A rule that can be corrected per order beats a
guess spread silently across 80 rows, and the mode is an ordinary
editable field.

## One switch for every money figure

Money is shown **including VAT by default** — that is what a customer
pays and how the Sheet always read — with an app-wide toggle to see every
figure excluding it. One switch in the nav, not a control per page:
half a screen in one convention and half in the other is how a number
gets misread.

`VatViewContext` provides it from the app layout, the same way order
types and production stages are provided. The choice is stored in a
cookie rather than local storage so the server render already agrees with
it — otherwise every page paints one convention and then flips.

**Aggregates convert per order, never after summing.** A month holding
both exempt and VAT-inclusive orders has no single divisor, so dividing a
month's total by 1.18 produces a number that is wrong for every order in
it. Every KPI, chart series and monthly rollup converts each order with
its own mode and rate, then adds. This is the one rule that, broken,
gives plausible-looking figures that are quietly false.

**An expense carries the same three modes**, for the same reason an order
does — a receipt from a registered supplier has VAT inside it, one from an
unregistered supplier has none, and nothing about the amount says which:

```sql
ALTER TABLE expenses ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE expenses ADD COLUMN vat_rate NUMERIC(5,4);
```

Defaults follow the same date rule as orders — expenses dated before
2026-06-23 are `exempt`, later ones `included` — and the field is edited
on the expense row like any other. `added` exists for the case where a
price was quoted before VAT.

Legacy Sheet expense items are monthly totals rather than receipts, so
they take the date rule and nothing more; they are already
approximations and the plan doesn't pretend otherwise.

With that, both sides of the report honour the switch: revenue and costs
convert per row and then add, and profit is finally the same kind of
number on both sides of the subtraction. **The Biz Plan's figures move
when the switch moves**, so every screen states which convention it is
showing, beside the figures rather than in a settings pane.

## Phase 2

1. An offer becomes a `PriceQuotation` draft when it is created.
2. A deposit becomes a `Receipt`; the balance becomes a `PaymentRequest`
   whose pay link is sent to the client.
3. Delivery or payment produces the tax document, as a draft to approve.
4. Charging a stored card (`paymentmethods/getforcustomer` →
   `payments/charge`) last, behind an explicit confirmation. The cards
   already exist on the customer records.

## Expenses — built, dormant, self-starting

SUMIT holds no expense data, so **Jimgem remains the expense system of
record** and the Expenses page is unchanged for now.

The sync is still written — expense documents are the same
`documents/list` call into the same mirror table — and it returns nothing
until such documents exist. The day the receipts become documents, in
SUMIT or through an accountant, expenses appear in Jimgem with no further
work. The month those documents start is also the Sheet cutover, computed
then rather than guessed now.

If that day doesn't come, the alternative is `documents/addexpense`,
which takes a supplier, a date, line items **and the receipt file**, with
`IsDraft`: Jimgem becomes where a photo gets its amount and category, and
SUMIT receives a structured document instead of a 79th photograph. That
would fix a real bookkeeping problem, but it is a change to how the
business works and not a decision the code should make.

## Risks and open questions

- **Per-order attribution only starts now.** Documents already in SUMIT
  can be matched to orders by amount and date, suggested for
  confirmation, never applied silently.
- **Two months of history** means the reconciliation view has a short
  baseline. It gets more useful every month.
- **Rate limits are undocumented.** The probe pulled a full history in
  one request without complaint; the windowed sync is far smaller.
- **The 60-second serverless ceiling** is why sync is windowed rather
  than full-history by default.
- **Imported orders carry the import year**, not the Sheet's real one, so
  any month-by-month comparison before June is meaningless.
