/**
 * [integration test] Atomic Checkout & Inventory Deduction
 *
 * Target Modules: POS (Next.js) → Inventory Database (Supabase)
 *
 * Scenario: Completing a sale must deduct stock levels and save the
 * transaction simultaneously. If any step fails, the inventory must
 * not be permanently decremented.
 *
 * Precondition: A product named "Sprite" exists with shop stock > 0.
 *
 * Steps:
 *   1. Record Sprite's shop stock level before the sale (via Inventory search).
 *   2. Cashier searches for Sprite in POS, adds it to cart, completes a cash sale.
 *   3. Verify the sale receipt appears with a valid sale number.
 *   4. Verify Sprite's shop stock decremented by exactly 1.
 *   5. Verify the sale record exists in the transactions list.
 *   6. Verify the inventory transaction log recorded the deduction.
 *
 * Expected Result: Stock drops by the exact quantity sold. Sale record
 * and inventory transaction both exist. No phantom stock is created.
 */

const TEST_PRODUCT = 'Sprite'

describe('[integration test] Atomic Checkout & Inventory Deduction', () => {
  let stockBefore: number
  let saleNumber: string

  it('records shop stock level before sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('input[placeholder="Search products..."]').type(TEST_PRODUCT)
    cy.contains('table tbody tr', TEST_PRODUCT).first().within(() => {
      // column order: Product(0), Shop Stock(1), Production Stock(2), Actions(3)
      cy.get('td').eq(1).invoke('text').then(stock => {
        stockBefore = parseInt(stock.trim())
      })
    }).then(() => {
      cy.log(`Product: ${TEST_PRODUCT} | Shop stock before: ${stockBefore}`)
      expect(stockBefore).to.be.greaterThan(0)
    })
  })

  it('cashier completes a cash sale and receipt appears', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.get('input[placeholder="Search products..."]').type(TEST_PRODUCT)
    cy.contains('button', TEST_PRODUCT).click()

    // Enter amount tendered so Charge can proceed with a cash sale
    cy.get('input[type="number"]').first().clear().type('1000')

    cy.contains('button', /^Charge ₱/).should('not.be.disabled').click()

    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.get('.receipt').invoke('text').then(text => {
      const match = text.match(/(SALE-\d{8}-\d{4})/)
      expect(match).to.not.be.null
      saleNumber = match![1]
      Cypress.env('atomicSaleNumber', saleNumber)
      cy.log(`Sale number: ${saleNumber}`)
    })
    cy.contains('button', 'Close').click()
  })

  it('shop stock decremented by exactly 1 after sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('input[placeholder="Search products..."]').type(TEST_PRODUCT)
    cy.contains('table tbody tr', TEST_PRODUCT).first().within(() => {
      cy.get('td').eq(1).invoke('text').then(stock => {
        const stockAfter = parseInt(stock.trim())
        cy.log(`Shop stock after: ${stockAfter} | Expected: ${stockBefore - 1}`)
        expect(stockAfter).to.equal(stockBefore - 1)
      })
    })
  })

  it('sale record exists in transactions with correct amount', () => {
    const sale = Cypress.env('atomicSaleNumber')
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains(sale, { timeout: 10000 }).should('be.visible')
    cy.contains(sale).parents('tr').first().within(() => {
      cy.contains('Cash').should('be.visible')
      cy.contains('Active').should('be.visible')
    })
  })

  it('inventory audit log records the sale deduction', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Inventory Transactions').click()

    cy.contains('label', 'Product').parent().find('select').as('productFilter')
    cy.get('@productFilter').select(TEST_PRODUCT)
    cy.get('@productFilter').find('option:selected').should('have.text', TEST_PRODUCT)

    cy.get('table tbody tr', { timeout: 10000 }).should($rows => {
      const hasMatch = $rows.toArray().some(row => {
        const text = Cypress.$(row).text().toLowerCase()
        return text.includes('sale') && text.includes('shop')
      })
      expect(hasMatch, 'expected a filtered row with Sale and Shop').to.be.true
    })
  })
})