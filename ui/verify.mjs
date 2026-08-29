// Smoke test for the timeline editor's interactions against a running `npm run dev`
// server (http://localhost:5173). One-time setup: `npx playwright install chromium`.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console.error: ' + msg.text())
})

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForSelector('.runway')

assert.equal(await page.locator('.block').count(), 8, 'expected 8 scenario blocks from quietMillionaireTrajectory')
assert.equal(await page.locator('.summary__value').first().textContent(), '$3.74M', 'expected the real engine output at the end of the trajectory')

// resize: drag the first handle
const handle = page.locator('.handle').first()
const box = await handle.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(100)
const metasAfterResize = await page.locator('.block__meta').allTextContents()
assert.ok(metasAfterResize[0].startsWith('6 yr'), 'dragging the handle right should grow the left scenario')
assert.ok(metasAfterResize[1].startsWith('4 yr'), "the immediate neighbor should absorb the change, shrinking by the same amount")
assert.equal(metasAfterResize.slice(2).join(), ['5 yr · 2036-01–2040-12', '5 yr · 2041-01–2045-12', '5 yr · 2046-01–2050-12', '5 yr · 2051-01–2055-12', '5 yr · 2056-01–2060-12', '5 yr · 2061-01–2065-12'].join(), 'nothing beyond the immediate neighbor should move')

// insert: click the first insert zone, then rename and delete the new scenario
await page.locator('.insert-zone').first().click()
await page.waitForTimeout(100)
assert.equal(await page.locator('.block').count(), 9, 'insert should add one scenario')

const newNameInput = page.locator('.block__name').nth(1)
await newNameInput.fill('Sabbatical')
await newNameInput.blur()
await page.waitForTimeout(100)
assert.deepEqual((await page.locator('.block__name').evaluateAll((els) => els.map((el) => el.value)))[1], 'Sabbatical')

await page.locator('.block').nth(1).hover()
await page.locator('.block__delete').nth(0).click()
await page.waitForTimeout(100)
assert.equal(await page.locator('.block').count(), 8, 'delete should remove the inserted scenario')

// click the chart to inspect a point in time
const chart = page.locator('.chart-card svg')
const cbox = await chart.boundingBox()
await chart.click({ position: { x: cbox.width * 0.3, y: cbox.height / 2 } })
await page.waitForTimeout(100)
const summaryValue = await page.locator('.summary__value').first().textContent()
assert.notEqual(summaryValue, '$3.74M', 'clicking the chart should move the summary off the end-of-trajectory value')

assert.deepEqual(errors, [], 'no console/page errors should occur during the whole interaction sequence')

await page.screenshot({ path: 'verify-screenshot.png', fullPage: true })
await browser.close()
console.log('All timeline editor interactions verified.')
