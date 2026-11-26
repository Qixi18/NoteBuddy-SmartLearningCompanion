import { expect, test } from '@playwright/test';
import { ensureDemoRun, gotoRoute } from './fixtures/demoContext';

test.beforeAll(async ({ request }) => {
  await ensureDemoRun(request);
});

test('teaching adjustment section explains why a plan needs an accepted review', async ({ page }) => {
  await gotoRoute(page, '/teaching/student', '学生个性化学习建议');

  await expect(page.getByText('教学实施与调整记录')).toBeVisible();
  await expect(page.getByText(/需要先接受当前节点的建议|教学调整计划/)).toBeVisible();
});

test('adjustment update endpoint accepts PATCH and never answers 405', async ({ request }) => {
  const missing = await request.patch('/api/teaching-adjustments/unknown-id', {
    data: { implementation: '演示更新', implementation_status: 'partial' },
  });
  expect(missing.status()).not.toBe(405);
  expect([400, 404, 422]).toContain(missing.status());

  const wrongMethod = await request.post('/api/teaching-adjustments/unknown-id', {
    data: { implementation: '演示更新' },
  });
  expect(wrongMethod.status()).toBe(405);
});
