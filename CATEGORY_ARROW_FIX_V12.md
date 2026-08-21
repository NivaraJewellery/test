# Category arrow overlay fix — v12

Root cause: the legacy global CSS rule `.category span` in `styles.css` applied absolute positioning and a 115px font size to every span inside a category card. The newer Shop by Category markup uses spans for the image wrapper, copy wrapper, and the small arrow inside `Explore Now`, so that arrow was rendered as a large overlay over the image.

Fix: `category-carousel.css` now explicitly resets the legacy span positioning/font rules for the new category card structure. The only arrows left are the normal inline arrow after `Explore Now` and the carousel previous/next controls.
