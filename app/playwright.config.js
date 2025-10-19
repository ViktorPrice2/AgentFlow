export default {
  testDir: '../tests/e2e',
  reporter: [
    ['list'],
    ['junit', { outputFile: '../reports/e2e/smoke.xml' }],
    ['html', { outputFolder: '../reports/e2e/html', open: 'never' }]
  ],
  timeout: 60_000,
  use: {
    headless: true
  }
};
