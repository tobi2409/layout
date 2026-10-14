import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compileFile, compileHtml, compilePath } from '../bin/layout.mjs'

test('generates tracks and placements in document order', () => {
    const result = compileHtml(`<!doctype html><html><head></head><body>
        <div class="frame">
            <header @align="top"></header>
            <nav @align="left"></nav>
            <main @align="client"></main>
            <aside @align="right"></aside>
            <footer @align="bottom"></footer>
        </div>
    </body></html>`, 'app.html')

    assert.match(result.css, /grid-template-rows: auto 1fr auto/)
    assert.match(result.css, /grid-template-columns: auto 1fr auto/)
    assert.match(result.css, /data-layout-item=["']1-1["'].*grid-row: 1; grid-column: 1 \/ -1/)
    assert.match(result.css, /data-layout-item=["']1-3["'].*grid-row: 2; grid-column: 2/)
    assert.match(result.html, /<link rel="stylesheet" href="app-layout.css">/)
    assert.match(result.html, /<script type="module" src="app-layout.js"><\/script>/)
    assert.match(result.html, /data-layout-align="client"/)
    assert.doesNotMatch(result.html, /@align/)
});

test('recomputes a frame inside a media query', () => {
    const align = JSON.stringify({ default: 'left', 'min-width: 300px an max-height: 500px': 'top' })

    const result = compileHtml(`<!doctype html><html><head></head><body>
        <div class="frame"><nav @align='${align}'></nav><main @align="client"></main></div>
    </body></html>`, 'responsive.html')

    assert.match(result.css, /grid-template-columns: auto 1fr/)
    assert.match(result.css, /@media \(min-width: 300px\) and \(max-height: 500px\)/)
    assert.match(result.css, /@media[\s\S]*grid-template-rows: auto 1fr/)
    assert.match(result.css, /@media[\s\S]*grid-template-columns: 1fr/)
});

test('processes frames inside template elements', () => {
    const result = compileHtml(`<!doctype html><html><head></head><body>
        <template id="app-template">
            <div class="frame">
                <div @align="left">Left</div>
                <div @align="right">Right</div>
            </div>
        </template>
    </body></html>`, 'template.html')

    assert.match(result.html, /<template id="app-template">[\s\S]*data-layout-frame="1"/)
    assert.match(result.html, /data-layout-item="1-1" data-layout-align="left"/)
    assert.match(result.html, /data-layout-item="1-2" data-layout-align="right"/)
    assert.doesNotMatch(result.html, /@align/)
    assert.match(result.css, /grid-template-columns: auto 1fr auto/)
})

test('does not add the generated stylesheet twice', () => {
    const first = compileHtml('<!doctype html><html><head></head><body></body></html>', 'app.html')
    const second = compileHtml(first.html, 'app.html')
    assert.equal(second.html.match(/app-layout\.css/g)?.length, 1)
})

test('writes generated files without changing the source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'layout-'))

    const sourceFile = join(directory, 'app.html')
    const source = '<!doctype html><html><head></head><body><div class="frame"><main @align="client"></main></div></body></html>'

    try {
        await writeFile(sourceFile, source);
        const result = await compileFile(sourceFile);

        assert.equal(await readFile(sourceFile, 'utf8'), source)
        assert.equal(result.htmlFile, join(directory, 'generated', 'app.html'))
        assert.equal(result.cssFile, join(directory, 'generated', 'app-layout.css'))
        assert.equal(result.runtimeFile, join(directory, 'generated', 'app-layout.js'))
        assert.doesNotMatch(await readFile(result.htmlFile, 'utf8'), /@align/)
        assert.match(await readFile(result.cssFile, 'utf8'), /grid-template-rows: 1fr/)
        assert.match(await readFile(result.runtimeFile, 'utf8'), /export function setAlign/)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('writes files to a custom output directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'layout-'))
    const sourceFile = join(directory, 'app.html')
    const source = '<!doctype html><html><head></head><body></body></html>'

    try {
        await writeFile(sourceFile, source)
        const result = await compileFile(sourceFile, 'dist')

        assert.equal(result.htmlFile, join(directory, 'dist', 'app.html'))
        assert.equal(result.cssFile, join(directory, 'dist', 'app-layout.css'))
        assert.equal(result.runtimeFile, join(directory, 'dist', 'app-layout.js'))
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('recursively compiles HTML files while skipping output directories', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'layout-'))
    const nestedDirectory = join(directory, 'nested')
    const generatedDirectory = join(nestedDirectory, 'generated')
    const source = '<!doctype html><html><head></head><body></body></html>'

    try {
        await mkdir(generatedDirectory, { recursive: true })
        await Promise.all([
            writeFile(join(directory, 'index.html'), source),
            writeFile(join(nestedDirectory, 'page.htm'), source),
            writeFile(join(directory, 'notes.txt'), source),
            writeFile(join(generatedDirectory, 'old.html'), source)
        ])

        const results = await compilePath(directory)

        assert.deepEqual(
            results.map((result) => result.htmlFile).sort(),
            [
                join(directory, 'generated', 'index.html'),
                join(nestedDirectory, 'generated', 'page.htm')
            ].sort()
        )
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})