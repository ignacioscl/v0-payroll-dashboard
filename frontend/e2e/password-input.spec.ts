/**
 * El botón de mostrar la contraseña va dentro del campo (plans/plan-buenas-practicas-v0, 5.3; regla global «Mostrar la
 * contraseña va dentro del campo»). En compu y en celular, con el Chromium de Playwright. No necesita usuario.
 */
import { expect, test } from '@playwright/test'

test('el ojo está dentro del campo, a la derecha, y muestra y oculta la contraseña', async ({ page }) => {
  await page.goto('/login')
  const input = page.locator('#password')
  await input.fill('secreto-de-prueba')
  await expect(input).toHaveAttribute('type', 'password')

  const show = page.getByRole('button', { name: 'Show password' })
  const f = await input.boundingBox()
  const b = await show.boundingBox()
  expect(f && b, 'campo y ojo visibles').toBeTruthy()
  if (f && b) {
    expect(b.x, 'el ojo arranca dentro del campo').toBeGreaterThanOrEqual(f.x)
    expect(b.x + b.width, 'el ojo termina dentro del campo').toBeLessThanOrEqual(f.x + f.width + 1)
    expect(b.y, 'no se sale por arriba').toBeGreaterThanOrEqual(f.y - 1)
    expect(b.y + b.height, 'no se sale por abajo').toBeLessThanOrEqual(f.y + f.height + 1)
    expect(f.x + f.width - (b.x + b.width), 'pegado al borde derecho').toBeLessThanOrEqual(8)
  }

  await show.click()
  await expect(input).toHaveAttribute('type', 'text')
  const hide = page.getByRole('button', { name: 'Hide password' })
  await expect(hide).toHaveAttribute('aria-pressed', 'true')
  await hide.click()
  await expect(input).toHaveAttribute('type', 'password')
  await expect(input).toHaveValue('secreto-de-prueba')
})
