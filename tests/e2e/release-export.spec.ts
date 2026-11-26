import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('release panel is present and blocks export before three confirmed cases', async ({ page }) => {
  await gotoRoute(page, '/', '教学工作台');

  await expect(page.getByText('赛事发布预检与材料导出')).toBeVisible();
  await expect(page.getByText('尚无已确认案例')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出赛事材料' })).toBeDisabled();
});

test('release preflight rejects an incomplete request instead of exporting', async ({ request }) => {
  const run = await request.get('/api/run');
  const runId = (await run.json()).run_id as string;
  const response = await request.get('/api/release-checks', {
    params: { node: 'N01', reviewer: '演示教师', content_reviewed: 'true' },
  });
  expect([400, 422]).toContain(response.status());
  const exportResponse = await request.post('/api/export-submission', {
    data: { run_id: runId, case_ids: ['D01'], node_id: 'N01', preflight_fingerprint: 'x', reviewer: '演示教师', content_reviewed: true },
  });
  expect([400, 422]).toContain(exportResponse.status());
});
