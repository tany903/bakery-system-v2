import './commands'

// Next.js dev-mode's Fast Refresh script occasionally throws this specific,
// harmless error on a cold page load inside Cypress's iframe. Only this exact
// message is ignored — any other uncaught error still fails the test normally.
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes("Cannot read properties of null (reading 'document')")) {
    return false
  }
})