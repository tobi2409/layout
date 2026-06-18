# Layout

A small Delphi-like layout system based on CSS Grid.

The idea: a container with `.frame` defines fixed areas such as `top`, `left`, `client`, or `bottom`. Child elements are assigned to an area through the CSS custom property `--align`.

## Goal

The system is meant to enable simple, readable user interfaces without scattering many utility classes throughout the HTML.

Example:

```html
<div class="frame">
	<header style="--align: top;">Header</header>
	<nav style="--align: left;">Navigation</nav>
	<main style="--align: client;">Inhalt</main>
	<aside style="--align: right;">Inspector</aside>
	<footer style="--align: bottom;">Footer</footer>
</div>
```

## Usage

Include `layout.css`:

```html
<link rel="stylesheet" href="layout.css">
```

Then create a container with `.frame` and place its direct child elements using `--align`.

## Supported align values

### Horizontal / vertical

- `top`
- `top-2`
- `top-3`
- `top-4`
- `top-5`
- `left`
- `left-2`
- `left-3`
- `left-4`
- `left-5`
- `client`
- `right`
- `right-2`
- `right-3`
- `right-4`
- `right-5`
- `bottom`
- `bottom-2`
- `bottom-3`
- `bottom-4`
- `bottom-5`

`client` is the flexible main area and uses the remaining space.

## Basic principle

- `top...` and `bottom...` occupy full rows.
- `left...` and `right...` occupy columns next to the content.
- `client` is placed in the center.
- Multiple `.frame` containers can be nested.

## Nesting example

```html
<div class="frame" style="height: 300px;">
	<header style="--align: top;">Header</header>

	<main class="frame" style="--align: client;">
		<div style="--align: top;">Toolbar</div>
		<section style="--align: client;">Inhalt</section>
		<div style="--align: bottom;">Status</div>
	</main>
</div>
```

## When this works well

Suitable for:

- app layouts
- admin interfaces
- classic desktop-like UI structures
- clearly separated areas such as header, sidebar, content, and footer

## When to combine it with something else

For dynamic lists or freely flowing rows, `.frame` is not the best level of abstraction. In those cases, a combination is usually better:

- `.frame` for the coarse page structure
- Flexbox for lists, toolbars, or rows
- `position: absolute` for overlays or freely positioned elements

## Possible future direction

It might be worth considering a switch from CSS Grid to Flexbox as the underlying model:

- `top` / `bottom` → `flex-direction: column` (children stack vertically)
- `left` / `right` → `flex-direction: row` (children stack horizontally)

This would naturally handle multiple children with the same alignment without overlapping, and without needing levels like `top-2` or `left-3`. Dynamic lists and reordering would also become easier. The trade-off is that the current single-class approach with `--align` would need to be rethought, since Flexbox distributes all children at once rather than placing them into named areas.

## Limitations

- Multiple elements with exactly the same `--align` overlap.
- That is why there are levels such as `top-2` or `left-3`.
- The number of levels is currently intentionally limited to 5 per direction.

## Files

- [layout.css](layout.css): core of the layout system
- [demo.html](demo.html): simple demo example
