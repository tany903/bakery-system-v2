describe('[functionality test] Products Management', () => {

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/products')
    cy.contains('Products').should('be.visible')
  })

  it('loads products list', () => {
    cy.contains('Products').should('be.visible')
    cy.contains('Sprite').should('be.visible')
  })

  it('shows active products by default', () => {
    cy.contains('button', 'Active').should('be.visible')
  })

  it('switches to archived products', () => {
    cy.contains('button', 'Archived').click()
    cy.contains(/Archived/i).should('be.visible')
  })

  it('opens add product modal', () => {
    cy.contains('button', /Add Product|New Product/i).click()
    cy.get('.fixed.inset-0').should('be.visible')
    cy.contains('button', /Cancel|Close/i).click()
  })

  it('add product form has required fields', () => {
    cy.contains('button', /Add Product|New Product/i).click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').should('be.visible')
      cy.get('select').should('be.visible')
      cy.get('input[type="number"]')
        .should('have.length.at.least', 1)
        .each(($input) => {
          cy.wrap($input).should('be.visible')
        })
    })

    cy.contains('button', /Cancel|Close/i).click()
  })

  it('adds a new product and it appears in the list', () => {
    const name = `Cypress Product ${Date.now()}`

    cy.contains('button', /Add Product|New Product/i).click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').first().type(name)
      cy.get('select').first().select(1)
      cy.get('input[type="number"]').eq(0).clear().type('99.50')
      cy.contains('button', 'Create Product').click()
    })

    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })

  it('can search products', () => {
    cy.get('input[placeholder*="Search"]').should('be.visible')
  })

  it('shows product price', () => {
    cy.contains(/₱\d+/).should('be.visible')
  })

  it('shows edit and archive buttons per product', () => {
    cy.contains('button', 'Edit').first().should('be.visible')
    cy.contains('button', 'Archive').first().should('be.visible')
  })

  it('edits a product and the update persists', () => {
    const originalName = `Edit Target ${Date.now()}`
    const updatedName = `Updated Product ${Date.now()}`

    cy.contains('button', /Add Product|New Product/i).click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').first().type(originalName)
      cy.get('select').first().select(1)
      cy.get('input[type="number"]').eq(0).clear().type('50')
      cy.contains('button', 'Create Product').click()
    })
    cy.contains(originalName, { timeout: 10000 }).should('be.visible')

    cy.contains(originalName).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Product').should('be.visible')
      cy.get('input[type="text"]').first().clear().type(updatedName)
      cy.get('input[type="number"]').eq(0).clear().type('123.00')
      cy.contains('button', 'Update Product').click()
    })

    cy.contains(originalName).should('not.exist')
    cy.contains(updatedName, { timeout: 10000 }).should('be.visible')
    cy.contains(updatedName).parents('.bg-white').first().within(() => {
      cy.contains('₱123.00').should('be.visible')
    })
  })

})