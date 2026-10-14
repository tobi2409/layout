# Layout

A small build-time layout system based on CSS Grid. Frame children declare their position with an `@align` HTML attribute; the CLI parses the document and generates the required tracks and placements.

## Installation

```sh
npm install @tobi2409/layout
```

## Usage

Add the `frame` class to a container and align its direct children:

```html
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8">
	<title>Application</title>
</head>
<body>
	<div class="frame">
		<header @align="top">Header</header>
		<nav @align="left">Navigation</nav>
		<main @align="client">Content</main>
		<aside @align="right">Inspector</aside>
		<footer @align="bottom">Status</footer>
	</div>
</body>
</html>
```

Process the HTML file:

```sh
npx layout path/to/application.html
```

You can also pass a directory. It is searched recursively for `.html` and `.htm` files; output directories are skipped:

```sh
npx layout path/to/pages
```

The output directory defaults to `generated`. Use `--output-dir` (or `-o`) to choose another name:

```sh
npx layout path/to/application.html --output-dir dist
```

For `path/to/application.html`, the command leaves the source unchanged and writes these files:

```text
path/to/generated/application.html
path/to/generated/application-layout.css
path/to/generated/application-layout.js
```

The generated HTML contains `data-layout-*` attributes instead of `@align`, so it is valid HTML. It also receives the stylesheet and runtime references in its `head` unless they already exist:

```html
<link rel="stylesheet" href="application-layout.css">
<script type="module" src="application-layout.js"></script>
```

Run the command again whenever the frame structure or an `@align` value changes. It overwrites both generated files deterministically without modifying the source document.

## Alignments

- `top`: adds an `auto` row before the flexible content row
- `bottom`: adds an `auto` row after the flexible content row
- `left`: adds an `auto` column before the flexible content column
- `right`: adds an `auto` column after the flexible content column
- `client`: occupies the central `1fr` row and column

Repeated values are placed in document order. For example, three `top` children produce `auto auto auto 1fr`; numbered values such as `top-2` are no longer needed.

Only direct children of a frame are considered. Frames can be nested without their children affecting the parent frame.

## Responsive alignment

Use a JSON object for breakpoint-specific alignment. Because JSON uses double quotes, wrap the HTML attribute in single quotes:

```html
<nav @align='{
	"default": "left",
	"max-width: 599px": "top",
	"min-width: 1200px and max-height: 800px": "right"
}'>Navigation</nav>
```

`default` is optional. Every other key becomes a media query. Feature lists can be written without surrounding parentheses; the generator emits valid CSS such as:

```css
@media (min-width: 1200px) and (max-height: 800px) { /* ... */ }
```

For each query, all tracks and placements in the affected frame are recalculated. When multiple media queries match simultaneously, normal CSS source order determines the result.

## Runtime API

The generated runtime exposes `setAlign` globally. Pass a generated layout element and its new alignment:

```js
const inspector = document.querySelector(".inspector");
setAlign(inspector, "bottom");
```

`setAlign` updates the element's alignment, recalculates its parent frame's `grid-template-rows` and `grid-template-columns`, and sets `grid-row` and `grid-column` for every aligned child. The runtime value overrides generated responsive placement for that frame until the page is reloaded.

The API can also be imported directly:

```js
import { setAlign } from "@tobi2409/layout/runtime";
```

Supported runtime values are `top`, `right`, `bottom`, `left`, and `client`. The element must be a direct generated child of a frame.

## Development

```sh
npm test
node bin/layout.mjs examples/demo/demo.html
node bin/layout.mjs examples/list/list.html
```

The Todo example in `examples/list/list.html` demonstrates how newly appended elements are registered and positioned with `setAlign(todo, "top")`.
