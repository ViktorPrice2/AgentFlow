export default {
  testDir: '../tests/e2e',
  reporter: [['list'], ['junit', { outputFile: '../reports/e2e/smoke.xml' }]],
  timeout: 60000,
  use: {
    headless: true
  }
};
