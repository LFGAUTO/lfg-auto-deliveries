import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React, { act } from 'react'
import { matchesBoardFilter } from '../src/lib/boardFilters.js'

 test('publication filters exclude completed and archived jobs from Live + Drafts', () => {
  for (const d of [{ is_ready: true }, { is_ready: false }]) assert.equal(matchesBoardFilter(d, 'scheduled'), true)
  for (const d of [{ is_ready: true, delivered_at: '2026-10-19' }, { status: 'delivered' }, { archived: true }]) {
    for (const filter of ['scheduled', 'live', 'drafts']) assert.equal(matchesBoardFilter(d, filter), false)
    assert.equal(matchesBoardFilter(d, 'delivered'), true)
  }
  assert.equal(matchesBoardFilter({ is_ready: false }, 'live'), false)
  assert.equal(matchesBoardFilter({ is_ready: true }, 'drafts'), false)
 })

 test('board defaults to combined, labels both stages, preserves weekdays and remembers filter', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/tv' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Upgrade an older board that had its original default saved.
  localStorage.setItem('lfg-tv-status-filter', 'live')
  const { createRoot } = await import('react-dom/client')
  const dir = await mkdtemp(path.resolve('.ui-test-'))
  const result = await build({ entryPoints: ['src/pages/TVBoard.jsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', plugins: [{ name: 'board-fixture', setup(b) {
    b.onResolve({ filter: /^react(?:\/|$)/ }, a => ({path:a.path,external:true}))
    b.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'db', namespace: 'mock' }))
    b.onResolve({ filter: /hooks\/useRefresh$/ }, () => ({ path: 'refresh', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'refresh' ? `import {useEffect} from 'react';export default function useRefresh(fn){useEffect(()=>{fn()},[])}` : `export const supabase={from(){const q={select(){return q},or(){return q},order(){return Promise.resolve({data:globalThis.boardRows})}};return q}}`, loader: 'js' }))
  } }] })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const monday = new Date(today + 'T12:00:00Z'); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const date = monday.toISOString().slice(0,10)
  globalThis.boardRows = [
    { id: 'live', is_ready: true, status: 'assigned', delivery_date: date, customer_name: 'Live Customer' },
    { id: 'draft', is_ready: false, status: 'assigned', delivery_date: date, customer_name: 'Draft Customer' },
    { id: 'done', is_ready: true, status: 'delivered', delivery_date: date, customer_name: 'Finished Customer', delivered_at: date + 'T16:00:00Z' }
  ]
  const file = path.join(dir, 'board.mjs'); await writeFile(file, result.outputFiles[0].text)
  const { default: Board } = await import(pathToFileURL(file))
  let root = createRoot(document.getElementById('root'))
  const filter = name => [...document.querySelectorAll('[aria-label="Delivery status filter"] button')].find(b => b.textContent === name)
  try {
    await act(async () => root.render(React.createElement(Board)))
    assert.equal(filter('Live + Drafts').getAttribute('aria-pressed'), 'true')
    assert.deepEqual([...document.querySelectorAll('.tv-stage')].map(e => e.textContent).sort(), ['DRAFT', 'LIVE'])
    assert.deepEqual([...document.querySelectorAll('.tv-day-heading h2')].map(e => e.textContent), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    assert.ok(document.querySelector('.tv-run--draft'))
    await act(async () => filter('Live').click())
    assert.equal(document.querySelectorAll('.tv-run').length, 1)
    assert.equal(document.querySelector('.tv-stage').textContent, 'LIVE')
    await act(async () => filter('Drafts').click())
    assert.equal(document.querySelectorAll('.tv-run').length, 1)
    assert.equal(document.querySelector('.tv-stage').textContent, 'DRAFT')
    await act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(React.createElement(Board)))
    assert.equal(filter('Drafts').getAttribute('aria-pressed'), 'true')
    assert.equal(document.querySelector('.tv-stage').textContent, 'DRAFT')
  } finally { await act(async () => root.unmount()); await rm(dir, { recursive: true, force: true }); dom.window.close() }
 })
