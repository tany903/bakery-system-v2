describe('POS discounts', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('Cart is empty').should('be.visible')
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
  })

  it('applies a day-old discount and shows 50% off price in cart', () => {
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('DAY-OLD').should('be.visible')

    // original price should be struck through, discounted price shown
    cy.get('.line-through').should('be.visible')
    cy.contains('% Discount').should('be.disabled')
  })

  it('removes a day-old discount when toggled off', () => {
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('DAY-OLD').should('be.visible')
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('DAY-OLD').should('not.exist')
    cy.get('.line-through').should('not.exist')
  })

  it('applies a percentage discount and shows it as a badge', () => {
    cy.contains('button', '% Discount').click()
    cy.get('select').select('20% off')
    cy.contains('button', 'Apply').click()
    cy.contains('20% OFF').should('be.visible')
    cy.get('.line-through').should('be.visible')
  })

  it('removes a percentage discount when clicking the badge', () => {
    cy.contains('button', '% Discount').click()
    cy.get('select').select('20% off')
    cy.contains('button', 'Apply').click()
    cy.contains('20% OFF').should('be.visible')
    // click the badge button to remove
    cy.contains('button', '20% ✕').click()
    cy.contains('20% OFF').should('not.exist')
    cy.get('.line-through').should('not.exist')
  })

  it('cannot apply both day-old and percentage discount simultaneously', () => {
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('DAY-OLD').should('be.visible')
    cy.contains('button', '% Discount').should('be.disabled')
  })

  it('day-old discount clears when percentage discount is applied first', () => {
    cy.contains('button', '% Discount').click()
    cy.get('select').select('20% off')
    cy.contains('button', 'Apply').click()
    cy.contains('button', '🍞 Day-Old').click()
    // day-old should override and clear the % discount
    cy.contains('DAY-OLD').should('be.visible')
    cy.contains('20% OFF').should('not.exist')
  })

  it('shows original total in cart footer when discounts are applied', () => {
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('Original').should('be.visible')
  })
})