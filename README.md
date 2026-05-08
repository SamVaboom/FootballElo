# Champions League Elo Ratings

This is a static browser app that calculates continuous Champions League / European Cup Elo ratings from the local `europe-champions-league-master` data folder.

## Running locally

Serve the repository with a local static server, then open `main.html` through that server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/main.html>.

Opening `main.html` directly with `file://` may fail because browser `fetch()` usually blocks local file reads. VS Code Live Server, `python3 -m http.server`, and GitHub Pages-style static hosting are supported.
