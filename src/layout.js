const ALIGNMENTS = new Set(['top', 'right', 'bottom', 'left', 'client'])
let runtimeItemId = 0

function validateAlignment(alignment) {
    if (!ALIGNMENTS.has(alignment)) {
        throw new TypeError(`Unsupported alignment "${alignment}"`)
    }
}

function formatMediaQuery(query) {
    const normalized = query.trim().replace(/\s+an\s+/gi, ' and ')

    if (normalized.startsWith('(')) {
        return normalized
    }

    return normalized
        .split(/\s+and\s+/i)
        .map((feature) => `(${feature.trim()})`)
        .join(' and ')
}

function getAlignment(element) {
    const value = element.dataset.layoutAlign

    if (!value?.trim().startsWith('{')) {
        return value
    }

    const specification = JSON.parse(value)
    let alignment = specification.default

    for (const [query, candidate] of Object.entries(specification)) {
        if (query !== 'default' && globalThis.matchMedia(formatMediaQuery(query)).matches) {
            alignment = candidate
        }
    }

    return alignment
}

function place(element, row, column) {
    element.style.gridRow = String(row)
    element.style.gridColumn = String(column)
}

function updateFrame(frame) {
    const groups = Object.fromEntries([...ALIGNMENTS].map((alignment) => [alignment, []]))
    const items = [...frame.children].filter((child) => child.dataset.layoutItem && child.dataset.layoutAlign)

    for (const item of items) {
        const alignment = getAlignment(item)

        if (alignment) {
            validateAlignment(alignment)
            groups[alignment].push(item)
        }

        item.style.gridRow = ''
        item.style.gridColumn = ''
    }

    const centerRow = groups.top.length + 1
    const centerColumn = groups.left.length + 1

    frame.style.gridTemplateRows = [...groups.top.map(() => 'auto'), '1fr', ...groups.bottom.map(() => 'auto')].join(' ')
    frame.style.gridTemplateColumns = [...groups.left.map(() => 'auto'), '1fr', ...groups.right.map(() => 'auto')].join(' ')

    groups.top.forEach((item, index) => place(item, index + 1, '1 / -1'))
    groups.bottom.forEach((item, index) => place(item, centerRow + index + 1, '1 / -1'))
    groups.left.forEach((item, index) => place(item, centerRow, index + 1))
    groups.right.forEach((item, index) => place(item, centerRow, centerColumn + index + 1))
    groups.client.forEach((item) => place(item, centerRow, centerColumn))
}

export function setAlign(element, alignment) {
    validateAlignment(alignment)

    const frame = element?.parentElement

    if (!frame?.dataset.layoutFrame) {
        throw new TypeError("setAlign expects a direct child of a generated frame")
    }

    if (!element.dataset.layoutItem) {
        runtimeItemId += 1
        element.dataset.layoutItem = `${frame.dataset.layoutFrame}-runtime-${runtimeItemId}`
    }

    element.dataset.layoutAlign = alignment
    updateFrame(frame)

    return element
}

globalThis.setAlign = setAlign