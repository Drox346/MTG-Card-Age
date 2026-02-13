# MTG-Card-Age

## Description
Shows when Magic cards fall out of rotation on the https://mtgdecks.net/Standard deck overview. Script(s) are written for the browser add-on "Violentmonkey".

## Installation
1) Install the browser add-on Violentmonkey.
2) Open Violentmonkey settings and create a new script.
3) Copy all the contents of `scripts/standard_year_annotator.js` into that new empty script.

## Usage
Runs on decks viewed at `https://mtgdecks.net/Standard/*` and appends a year column to each card row.

## Notes
- If a card appears with multiple origins in the CSV, the script uses the highest available year.
- CSV data is cached for 24 hours before refresh.

## Data
Data provided by https://mtgjson.com/api/v5/csv/.  
Stripped non-viable cards from data: `^(?!.*(?:WOE|LCI|MKM|OTJ|BIG|BLB|DSK|FDN|DFT|TDM|FIN|EOE|SPM|OM1|TLA|ECL)\n).*$`  
Adding quotation marks to all names that don't have it yet for consistent format: Search `^(?!")[^,]*`, Replace with `"\0"`
