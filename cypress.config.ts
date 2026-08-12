import { defineConfig } from 'cypress'

export default defineConfig({
  projectId: 'pd4osg',
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    video: false,
    setupNodeEvents(on, config) {
      return config
    },
  },
})