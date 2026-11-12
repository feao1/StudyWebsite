# CommonStudy

A static, shareable SAT study workbook. IBM Plex Serif and Sans, ink and paper, responsive numbered practice index. Includes the existing SAT practice tests 4–11 and all four practice modes.

## Run

Serve this folder with `python3 -m http.server 8766`, then open http://localhost:8766.

## Deploy to Netlify

Import the `feao1/StudyWebsite` GitHub repository. Deploy branch: `main`. Leave build command blank. Publish directory: `.`. The included netlify.toml sets the publish directory. Push commits to redeploy.

## Import

Use **Import a set** with `.qpack` or `.txt`. Examples are in `examples/`. Text supports a `Title:` line followed by tab-separated term/definition pairs, or question blocks separated by `---`. Fields: Question, Passage (optional), A–D choices (optional), Answer, Explanation (optional). Without choices, Answer may contain alternatives separated by `|`.

## Sharing and storage

Share next to a module copies its link. Included modules use short URLs. Imported modules up to 60 KB are encoded in the URL fragment; recipients can study without an account. Larger sets should be shared as files. Shared imports do not overwrite saved packs. Results and imports remain browser-local; they do not synchronize across devices or domains. Existing CommonStudy storage keys and schemas are retained, but browser storage on an old domain remains there.

Fonts load from Google Fonts. No frontend build or server backend is required.

## General study sets

Non-SAT sets use Flashcards, Learn, Test, Write, Spell, Match, Blast and Blocks. Options saved per set include answer direction, shuffle, starred-only practice, Learn question types, test length/types and exact or relaxed written grading. Stars and preferences are local to this browser. These are independent implementations, not a Quizlet integration; classroom Live, accounts and AI semantic grading are not included.

MathJax 3.2.2 loads from jsDelivr and renders explicit AsciiMath in backticks or LaTeX between \( and \). For example, backtick-delimited `1/sqrt(1-x^2)` becomes a typeset fraction. Math needs an internet connection. Written math answers use the original text notation; equivalent algebraic expressions are not automatically recognized.
