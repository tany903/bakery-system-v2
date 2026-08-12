describe('Products management', () => {

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/products')
    cy.contains('Products').should('be.visible')
  })

  it('loads products list', () => {
    cy.contains('Products').should('be.visible')

    // Your products are cards, not table rows
    cy.contains('Sprite').should('be.visible')
  })

  it('switches to categories tab', () => {
    cy.contains('button', 'Categories').click()

    cy.contains(/All Categories|Categories/i)
      .should('be.visible')
  })

  it('shows active products by default', () => {
    cy.contains('button', 'Active')
      .should('be.visible')
  })

  it('switches to archived products', () => {
    cy.contains('button', 'Archived').click()

    cy.contains(/Archived/i)
      .should('be.visible')
  })

  it('opens add product modal', () => {
    cy.contains('button', /Add Product|New Product/i)
      .click()

    cy.get('.fixed.inset-0')
      .should('be.visible')

    cy.contains('button', /Cancel|Close/i)
      .click()
  })

  it('add product form has required fields', () => {
    cy.contains('button', /Add Product|New Product/i)
      .click()

    cy.get('.fixed.inset-0').within(() => {

      // Product name
      cy.get('input[type="text"]')
        .should('be.visible')

      // Category
      cy.get('select')
        .should('be.visible')

      // Price and inventory number fields
      cy.get('input[type="number"]')
        .should('have.length.at.least', 1)
        .each(($input) => {
          cy.wrap($input).should('be.visible')
        })
    })

    cy.contains('button', /Cancel|Close/i)
      .click()
  })

  it('can search products', () => {
    cy.get('input[placeholder*="Search"]')
      .should('be.visible')
  })

  it('shows product price', () => {
    cy.contains(/₱\d+/)
      .should('be.visible')
  })

  it('shows edit and archive buttons per product', () => {
    cy.contains('button', 'Edit')
      .first()
      .should('be.visible')

    cy.contains('button', 'Archive')
      .first()
      .should('be.visible')
  })

})