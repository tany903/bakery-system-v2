describe('[functionality test] Stock Adjustment (Shop & Production)', () => {
  /**
   * Target Feature: Direct stock adjustment via /inventory
   * Verifies: modal opens, live preview, positive/negative adjustments,
   * validation, and independent Shop/Production stock adjustment.
   */

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.contains('Inventory Management', { timeout: 10000 })
      .should('be.visible')
  })

  function getProductsTable() {
    return cy.contains('h2', 'All Products')
      .parents('div.bg-white')
      .find('table')
  }

  it('opens the Shop adjustment modal with current stock shown', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.contains('button', 'Shop').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Adjust Stock').should('be.visible')
      cy.contains('shop').should('be.visible')
      cy.contains('Current Stock').should('be.visible')
      cy.get('input[type="number"]').should('be.visible')
      cy.contains('button', 'Confirm Adjustment').should('be.visible')
    })

    cy.contains('button', 'Cancel').click()
  })

  it('shows a live "New Stock Level" preview as quantity is typed', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.contains('button', 'Shop').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('New Stock Level').should('not.exist')

      cy.get('input[type="number"]').type('5')

      cy.contains('New Stock Level').should('be.visible')
    })

    cy.contains('button', 'Cancel').click()
  })

  it('increases shop stock by a positive adjustment', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.get('td')
          .eq(1)
          .invoke('text')
          .then(text => {
            const before = parseInt(text.trim(), 10)

            expect(before, 'Shop stock should be a valid number')
              .to.not.be.NaN

            cy.wrap(before).as('stockBefore')
          })

        cy.contains('button', 'Shop').click()
      })

    // Register update requests BEFORE clicking Confirm
    cy.intercept('PATCH', '**/rest/v1/products*').as('stockUpdate')
    cy.intercept('POST', '**/rest/v1/inventory_transactions*').as('inventoryLog')

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').type('5')
      cy.get('textarea').type('Cypress test adjustment (+5)')
      cy.contains('button', 'Confirm Adjustment').click()
    })

    // Wait for the actual database update to finish
    cy.wait('@stockUpdate', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    cy.wait('@inventoryLog', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    // Wait until the refreshed value is displayed
    cy.get('.fixed.inset-0', { timeout: 10000 })
      .should('not.exist')

    cy.get('@stockBefore').then(before => {
      const expected = (before as unknown as number) + 5

      getProductsTable()
        .find('tbody tr')
        .first()
        .should('contain.text', String(expected))
    })
  })

  it('decreases shop stock by a negative adjustment', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.get('td')
          .eq(1)
          .invoke('text')
          .then(text => {
            const before = parseInt(text.trim(), 10)

            expect(before, 'Shop stock should be a valid number')
              .to.not.be.NaN

            expect(
              before,
              'Shop stock must be at least 3 for this test'
            ).to.be.at.least(3)

            cy.wrap(before).as('stockBefore')
          })

        cy.contains('button', 'Shop').click()
      })

    cy.intercept('PATCH', '**/rest/v1/products*').as('stockUpdate')
    cy.intercept('POST', '**/rest/v1/inventory_transactions*').as('inventoryLog')

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').type('-3')
      cy.contains('button', 'Confirm Adjustment').click()
    })

    cy.wait('@stockUpdate', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    cy.wait('@inventoryLog', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.get('.fixed.inset-0', { timeout: 10000 })
      .should('not.exist')

    cy.get('@stockBefore').then(before => {
      const expected = (before as unknown as number) - 3

      getProductsTable()
        .find('tbody tr')
        .first()
        .should('contain.text', String(expected))
    })
  })

  it('blocks an adjustment that would take stock below zero', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.get('td')
          .eq(1)
          .invoke('text')
          .then(text => {
            const current = parseInt(text.trim(), 10)

            expect(current, 'Shop stock should be a valid number')
              .to.not.be.NaN

            cy.wrap(current).as('stockBefore')
          })

        cy.contains('button', 'Shop').click()
      })

    cy.get('@stockBefore').then(current => {
      const tooMuch = -((current as unknown as number) + 1000)

      cy.get('.fixed.inset-0').within(() => {
        cy.get('input[type="number"]')
          .type(String(tooMuch))

        cy.contains(
          'button',
          'Confirm Adjustment'
        ).click()

        cy.contains(
          'Cannot reduce stock below 0'
        ).should('be.visible')
      })
    })
  })

  it('requires a non-zero quantity before Confirm is enabled', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.contains('button', 'Shop').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains(
        'button',
        'Confirm Adjustment'
      ).should('be.disabled')

      cy.get('input[type="number"]').type('0')

      cy.contains(
        'button',
        'Confirm Adjustment'
      ).click()

      cy.contains(
        'Please enter a valid quantity'
      ).should('be.visible')
    })
  })

  it('adjusts Production stock independently from Shop stock', () => {
    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.get('td')
          .eq(2)
          .invoke('text')
          .then(text => {
            const before = parseInt(text.trim(), 10)

            expect(before, 'Production stock should be a valid number')
              .to.not.be.NaN

            cy.wrap(before).as('prodStockBefore')
          })

        cy.contains('button', 'Production').click()
      })

    cy.intercept('PATCH', '**/rest/v1/products*').as('stockUpdate')
    cy.intercept('POST', '**/rest/v1/inventory_transactions*').as('inventoryLog')

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('production').should('be.visible')
      cy.get('input[type="number"]').type('4')
      cy.contains('button', 'Confirm Adjustment').click()
    })

    cy.wait('@stockUpdate', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    cy.wait('@inventoryLog', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.get('.fixed.inset-0', { timeout: 10000 })
      .should('not.exist')

    cy.get('@prodStockBefore').then(before => {
      const expected = (before as unknown as number) + 4

      getProductsTable()
        .find('tbody tr')
        .first()
        .should('contain.text', String(expected))
    })
  })
})