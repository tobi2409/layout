import assert from 'node:assert/strict'
import test from 'node:test'
import { setAlign } from '../src/layout.js'

function item(alignment) {
    return {
        dataset: { layoutItem: 'item', layoutAlign: alignment },
        style: {},
        parentElement: undefined
    }
}

test('setAlign recalculates the frame tracks and every item placement', () => {
    const top = item('top')
    const client = item('client')
    const right = item('right')

    const frame = {
        children: [top, client, right],
        dataset: { layoutFrame: '1' },
        style: {}
    }

    for (const child of frame.children) {
        child.parentElement = frame
    }

    setAlign(right, 'bottom')

    assert.equal(right.dataset.layoutAlign, 'bottom')
    assert.equal(frame.style.gridTemplateRows, 'auto 1fr auto')
    assert.equal(frame.style.gridTemplateColumns, '1fr')
    assert.deepEqual(top.style, { gridRow: '1', gridColumn: '1 / -1' })
    assert.deepEqual(client.style, { gridRow: '2', gridColumn: '1' })
    assert.deepEqual(right.style, { gridRow: '3', gridColumn: '1 / -1' })
})

test('setAlign rejects unsupported values and non-layout elements', () => {
    assert.throws(() => setAlign(item('client'), 'middle'), /Unsupported alignment/)
    assert.throws(() => setAlign({}, 'client'), /generated frame/)
})

test('setAlign registers a newly appended frame child', () => {
    const todo = { dataset: {}, style: {}, parentElement: undefined }

    const frame = {
        children: [todo],
        dataset: { layoutFrame: '4' },
        style: {}
    }

    todo.parentElement = frame

    setAlign(todo, 'top')

    assert.match(todo.dataset.layoutItem, /^4-runtime-\d+$/)
    assert.equal(todo.dataset.layoutAlign, 'top')
    assert.equal(frame.style.gridTemplateRows, 'auto 1fr')
    assert.deepEqual(todo.style, { gridRow: '1', gridColumn: '1 / -1' })
})