#!/usr/bin/env node

import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, serialize } from 'parse5'

const ALIGNMENTS = new Set(['top', 'right', 'bottom', 'left', 'client'])

function getAttribute(node, name) {
    return node.attrs?.find((attribute) => attribute.name === name)
}

function setAttribute(node, name, value) {
    const attribute = getAttribute(node, name)

    if (attribute) {
        attribute.value = value
    } else {
        node.attrs.push({ name, value })
    }
}

function removeAttribute(node, name) {
    node.attrs = node.attrs?.filter((attribute) => attribute.name !== name) ?? []
}

function hasClass(node, className) {
    return getAttribute(node, 'class')?.value.split(/\s+/).includes(className) ?? false
}

function walk(node, visitor) {
    // visitor ist ein Callback, der für jeden DOM-Knoten einmal aufgerufen wird.
    visitor(node)

    for (const child of node.childNodes ?? []) {
        walk(child, visitor)
    }

    // parse5 speichert den Inhalt von <template> in einem separaten DocumentFragment.
    if (node.content) {
        walk(node.content, visitor)
    }
}

function parseAlignment(value, source) {
    let parsed = value

    if (value.trim().startsWith('{')) {
        try {
            parsed = JSON.parse(value)
        } catch (error) {
            throw new Error(`${source}: invalid JSON in @align: ${error.message}`)
        }
    }

    if (typeof parsed === 'string') {
        validateAlignment(parsed, source)
        return { base: parsed, media: new Map() }
    }
    
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error(`${source}: @align must be an alignment or a JSON object`);
    }

    const media = new Map()
    let base

    for (const [query, alignment] of Object.entries(parsed)) {
        validateAlignment(alignment, source)

        if (query === 'default') {
            base = alignment
        } else {
            media.set(query, alignment)
        }
    }

    return { base, media }
}

function validateAlignment(alignment, source) {
    if (!ALIGNMENTS.has(alignment)) {
        throw new Error(`${source}: unsupported alignment "${alignment}"`)
    }
}

function repeat(track, count) {
    return Array.from({ length: count }, () => track)
}

// Ermittelt für einen Frame die im Basis- oder Media-Query-Zustand wirksamen
// Alignments und erzeugt daraus CSS-Regeln für Grid-Tracks und Elementpositionen.
// Die Funktion wird beim Verarbeiten der Items einmal für den Basiszustand und
// zusätzlich für jede definierte Query aufgerufen. query ist dabei nur der Text
// des zu erzeugenden CSS-Zustands, nicht die aktuell passende Bildschirmgröße;
// ob eine Media Query zutrifft, entscheidet später der Browser.
function rulesForState(frameId, items, query) {
    // Löst für jedes Element die aktuell gültige Ausrichtung auf: entweder den
    // Wert der Media Query oder das Basis-Alignment. Elemente ohne wirksames
    // Alignment werden ausgeschlossen.
    const activeItems = items.flatMap((item) => {
        const alignment = query && item.alignment.media.has(query)
            ? item.alignment.media.get(query)
            : item.alignment.base
            
        // Beispiel: { id: "1-1", alignment: { base: "client", media: new Map() }, activeAlignment: "client" }
        return alignment ? [{ ...item, activeAlignment: alignment }] : []
    })

    // Gruppiert die aktiven Elemente nach top, right, bottom, left und client.
    // Die Gruppengrößen bestimmen die Anzahl der Grid-Tracks; die Position eines
    // Elements in seiner Gruppe bestimmt anschließend grid-row bzw. grid-column.
    const groups = Object.fromEntries(
        [...ALIGNMENTS].map((alignment) => [
            alignment,
            activeItems.filter((item) => item.activeAlignment === alignment)
        ])
    )

    const centerRow = groups.top.length + 1
    const centerColumn = groups.left.length + 1

    const rows = [...repeat('auto', groups.top.length), '1fr', ...repeat('auto', groups.bottom.length)]
    const columns = [...repeat('auto', groups.left.length), '1fr', ...repeat('auto', groups.right.length)]

    const rules = [
        `[data-layout-frame='${frameId}'] {`,
        `    grid-template-rows: ${rows.join(' ')};`,
        `    grid-template-columns: ${columns.join(' ')};`,
        "}"
    ]

    groups.top.forEach((item, index) => rules.push(itemRule(item.id, index + 1, '1 / -1')))
    groups.bottom.forEach((item, index) => rules.push(itemRule(item.id, centerRow + index + 1, '1 / -1')))
    groups.left.forEach((item, index) => rules.push(itemRule(item.id, centerRow, String(index + 1))))
    groups.right.forEach((item, index) => rules.push(itemRule(item.id, centerRow, String(centerColumn + index + 1))))
    groups.client.forEach((item) => rules.push(itemRule(item.id, centerRow, String(centerColumn))))

    return rules.join('\n');
}

function itemRule(id, row, column) {
    return `[data-layout-item='${id}'] { grid-row: ${row}; grid-column: ${column}; }`
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

// Stellt sicher, dass im <head> genau ein Link auf das generierte Stylesheet
// vorhanden ist. Ein bereits existierender Link wird nicht erneut eingefügt.
function ensureStylesheet(document, href) {
    let head
    let existing

    walk(document, (node) => {
        if (node.tagName === 'head') {
            head = node
        }
        
        if (node.tagName === 'link' && getAttribute(node, 'href')?.value === href) {
            existing = node;
        }
    })

    if (existing) {
        return
    }

    if (!head) {
        throw new Error('HTML document has no <head> element')
    }

    const fragment = parse(`<link rel="stylesheet" href="${href}">`)
    let link

    // parse gibt ein DOM-Fragment zurück, daher müssen wir das <link>-Element daraus extrahieren.
    walk(fragment, (node) => {
        if (node.tagName === 'link') {
            link = node
        }
    })

    link.parentNode = head
    head.childNodes.push(link)
}

// Stellt sicher, dass im <head> genau ein Modul-Script für die Runtime-API
// vorhanden ist. Ein bereits existierendes Script wird nicht erneut eingefügt.
function ensureRuntime(document, src) {
    let head
    let existing

    walk(document, (node) => {
        if (node.tagName === 'head') {
            head = node
        }

        if (node.tagName === 'script' && getAttribute(node, 'src')?.value === src) {
            existing = node
        }
    })

    if (existing) {
        return
    }

    if (!head) {
        throw new Error('HTML document has no <head> element')
    }

    const fragment = parse(`<script type="module" src="${src}"></script>`)
    let script

    walk(fragment, (node) => {
        if (node.tagName === 'script') {
            script = node
        }
    })

    script.parentNode = head
    head.childNodes.push(script)
}

export function compileHtml(source, sourceName = 'document.html') {
    const document = parse(source)
    const frames = []

    walk(document, (node) => {
        if (node.tagName && hasClass(node, 'frame')) {
            frames.push(node)
        }
    })

    const css = [
        '.frame {',
        '    position: relative;',
        '    display: grid;',
        '}'
    ]

    frames.forEach((frame, frameIndex) => {
        const frameId = String(frameIndex + 1)
        setAttribute(frame, 'data-layout-frame', frameId)

        const items = []

        for (const child of frame.childNodes ?? []) {
            const attribute = getAttribute(child, '@align')

            if (!attribute) {
                continue
            }

            const id = `${frameId}-${items.length + 1}`

            setAttribute(child, 'data-layout-item', id)
            setAttribute(child, 'data-layout-align', attribute.value)

            // alignment kommt nicht aus dem DOM: parseAlignment wandelt den rohen
            // @align-Attributwert in { base, media } für die CSS-Erzeugung um.
            items.push({ id, alignment: parseAlignment(attribute.value, sourceName) })
            removeAttribute(child, '@align')
        }

        css.push('', rulesForState(frameId, items))

        const queries = new Set(items.flatMap((item) => [...item.alignment.media.keys()]))

        for (const query of queries) {
            const mediaRules = rulesForState(frameId, items, query)
                .split('\n')
                .map((line) => `    ${line}`)
                .join('\n')

            css.push('', `@media ${formatMediaQuery(query)} {\n${mediaRules}\n}`)
        }
    })

    const extension = extname(sourceName)
    const stem = basename(sourceName, extension)
    const stylesheet = `${stem}-layout.css`
    const runtime = `${stem}-layout.js`

    ensureStylesheet(document, stylesheet)
    ensureRuntime(document, runtime)

    return { html: serialize(document), css: `${css.join('\n')}\n`, stylesheet, runtime }
}

export async function compileFile(fileName, outputDirectoryName = 'generated') {
    const source = await readFile(fileName, 'utf8')
    const result = compileHtml(source, fileName)
    const outputDirectory = join(dirname(fileName), outputDirectoryName)
    const htmlFile = join(outputDirectory, basename(fileName))
    const cssFile = join(outputDirectory, result.stylesheet)
    const runtimeFile = join(outputDirectory, result.runtime)
    const runtimeSource = await readFile(new URL('../src/layout.js', import.meta.url), 'utf8')

    await mkdir(outputDirectory, { recursive: true })

    await Promise.all([
        writeFile(htmlFile, result.html),
        writeFile(cssFile, result.css),
        writeFile(runtimeFile, runtimeSource)
    ])

    return { ...result, htmlFile, cssFile, runtimeFile }
}

async function findHtmlFiles(directory, outputDirectoryName) {
    const files = []

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name)

        if (entry.isDirectory()) {
            if (entry.name !== outputDirectoryName) {
                files.push(...await findHtmlFiles(entryPath, outputDirectoryName))
            }
        } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
            files.push(entryPath)
        }
    }

    return files
}

export async function compilePath(inputPath, outputDirectoryName = 'generated') {
    const input = await stat(inputPath)
    const files = input.isDirectory()
        ? await findHtmlFiles(inputPath, outputDirectoryName)
        : [inputPath]

    return Promise.all(files.map((fileName) => compileFile(fileName, outputDirectoryName)))
}

async function main() {
    const args = process.argv.slice(2)
    const fileName = args[0]
    let outputDirectoryName = 'generated'

    if (!fileName) {
        console.error('Usage: layout <document.html|directory> [--output-dir <name>]')
        process.exitCode = 1
        return
    }

    for (let index = 1; index < args.length; index += 1) {
        const argument = args[index]

        if (argument === '--output-dir' || argument === '-o') {
            outputDirectoryName = args[index + 1]
            index += 1

            if (!outputDirectoryName) {
                throw new Error(`${argument} requires a directory name`)
            }
        } else {
            throw new Error(`Unknown argument: ${argument}`)
        }
    }

    const results = await compilePath(fileName, outputDirectoryName)

    for (const result of results) {
        console.log(`Generated ${result.htmlFile}`)
        console.log(`Generated ${result.cssFile}`)
        console.log(`Generated ${result.runtimeFile}`)
    }
}

const isMainModule = process.argv[1]
    && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))

if (isMainModule) {
    main().catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
}