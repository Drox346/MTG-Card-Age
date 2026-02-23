# MTG-Card-Age

## Description
Shows when Magic cards fall out of rotation on the https://mtgdecks.net/Standard deck overview. Script(s) are written for the browser add-on Violentmonkey.

## Installation
1. Install the browser add-on Violentmonkey.
2. Open Violentmonkey, then choose one install method:
3. Option A (manual): Click `New`, then paste the contents of `scripts/addon/standard_year_annotator.js`.
4. Option B (recommended): Click `Install from URL` and use  
`https://raw.githubusercontent.com/Drox346/MTG-Card-Age/main/scripts/addon/standard_year_annotator.js`

Option B makes updates easier, since you can use Violentmonkey's `Update` button later.

## Usage
Runs on decks viewed at `https://mtgdecks.net/Standard/*` and appends a year column to each card row.

## Screenshots
### Before
<img src="docs/before.png" alt="Before annotation" width="420" />

### After
<img src="docs/after.png" alt="After annotation" width="420" />

## Notes
- If a card appears in multiple expansions, the script uses the expansion that remains legal the longest.
- Rotation and card data are refreshed automatically about once per week. This happens in the background and is separate from script or add-on updates.

## Data
Card data provided by https://mtgjson.com/api/v5/csv/  
Current standard rotation provided by https://whatsinstandard.com/
