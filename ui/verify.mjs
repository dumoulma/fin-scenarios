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
// summary columns are: Month, then one per trajectory (just Master before any duplicate)
assert.equal(await page.locator('.summary__value').nth(1).textContent(), '$3.74M', 'expected the real engine output at the end of the trajectory')

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
const tickTextsAfterDelete = await page.locator('.ticks span').allTextContents()
assert.equal(tickTextsAfterDelete[tickTextsAfterDelete.length - 1], '2065-12', 'delete should give the freed duration back to the neighbor, preserving the total trajectory length')

// click the chart to inspect a point in time
const chart = page.locator('.chart-card svg')
const cbox = await chart.boundingBox()
await chart.click({ position: { x: cbox.width * 0.3, y: cbox.height / 2 } })
await page.waitForTimeout(100)
const summaryValue = await page.locator('.summary__value').nth(1).textContent()
assert.notEqual(summaryValue, '$3.74M', 'clicking the chart should move the summary off the end-of-trajectory value')

// duplicate the (still-active) Master into an Alternative, then diverge it
assert.equal(await page.locator('.trajectory-tab').count(), 1, 'only Master should exist before duplicating')
await page.locator('.dup-btn').click()
await page.waitForTimeout(100)
assert.equal(await page.locator('.trajectory-tab').count(), 2, 'duplicate should add one Alternative tab')
assert.ok(await page.locator('.trajectory-tab--active').locator('.trajectory-tab__name').inputValue().then((v) => v.endsWith('copy')), 'the new Alternative should become active immediately')
assert.equal(await page.locator('.legend').count(), 1, 'comparing 2+ trajectories should show a legend')

// resize a scenario in the now-active Alternative — Master's own numbers must not change
const altHandle = page.locator('.handle').first()
const altBox = await altHandle.boundingBox()
await page.mouse.move(altBox.x + altBox.width / 2, altBox.y + altBox.height / 2)
await page.mouse.down()
await page.mouse.move(altBox.x + 60, altBox.y + altBox.height / 2, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(100)

await page.locator('.trajectory-tab').first().click() // back to Master
await page.waitForTimeout(100)
const masterMetas = await page.locator('.block__meta').allTextContents()
assert.ok(masterMetas[0].startsWith('6 yr'), "switching tabs should show Master's own scenarios, unaffected by editing the Alternative")

// close the alternative
await page.locator('.trajectory-tab__close').click()
await page.waitForTimeout(100)
assert.equal(await page.locator('.trajectory-tab').count(), 1, 'closing the Alternative should remove its tab')

assert.deepEqual(errors, [], 'no console/page errors should occur during the whole interaction sequence')

await page.screenshot({ path: 'verify-screenshot.png', fullPage: true })
await browser.close()
console.log('All timeline editor + duplicate/compare interactions verified.')
