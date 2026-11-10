# PrepBook

A static, shareable SAT study workbook. IBM Plex Serif and Sans, ink and paper, responsive numbered practice index. Includes the existing SAT practice tests 4–11 and all four practice modes.

## Run

Serve this folder with `python3 -m http.server 8766`, then open http://localhost:8766.

## Deploy to Netlify

Import the `feao1/StudyWebsite` GitHub repository. Deploy branch: `main`. Leave build command blank. Publish directory: `.`. The included netlify.toml sets the publish directory. Push commits to redeploy.

## Import

Use **Import a set** with `.qpack` or `.txt`. Examples are in `examples/`. Text supports a `Title:` line followed by tab-separated term/definition pairs, or question blocks separated by `---`. Fields: Question, Passage (optional), A–D choices (optional), Answer, Explanation (optional). Without choices, Answer may contain alternatives separated by `|`.

## Sharing and storage

Share next to a module copies its link. Included modules use short URLs. Imported modules up to 60 KB are encoded in the URL fragment; recipients can study without an account. Larger sets should be shared as files. Shared imports do not overwrite saved packs. Results and imports remain browser-local; they do not synchronize across devices or domains. Existing PrepBook storage keys and schemas are retained, but browser storage on an old domain remains there.

Fonts load from Google Fonts. No frontend build or server backend is required.
