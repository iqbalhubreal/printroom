# Print Room

## Project structure
- `index.html`: application markup, external library references, and the import map.
- `css/styles.css`: application styling and responsive layout rules.
- `js/app.js`: the Three.js scene, application state, controls, and animations.

The browser translation opt-out is set with `meta name="google" content="notranslate"` and `translate="no"` on the document and body.

## Run
Because the app uses JavaScript modules and an import map, serve this folder from a local web server rather than opening `index.html` directly with `file://`.

For example, from this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser. An internet connection is needed for the externally hosted Three.js, PDF.js, and Google Fonts resources.
