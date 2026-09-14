import { defineConfig } from '@playwright/test';

const testDatabaseUrl = `sqlite:///./responsive_check_${Date.now()}.db`;

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'} -m uvicorn app.main:app --host 127.0.0.1 --port 8010`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8010/health',
      timeout: 60000,
      env: {
        DATABASE_URL: testDatabaseUrl,
        JWT_SECRET: 'isolated-responsive-test-secret',
        ADMIN_EMAIL: 'ui-admin@example.com',
        ADMIN_PASSWORD: 'ResponsiveTest123!',
        CORS_ORIGINS: 'http://127.0.0.1:5180',
        SEED_SAMPLE_DATA: 'true',
      },
    },
    {
      command: 'npm run dev -- --port 5180 --strictPort',
      url: 'http://127.0.0.1:5180',
      env: { VITE_API_URL: 'http://127.0.0.1:8010' },
    },
  ],
});
