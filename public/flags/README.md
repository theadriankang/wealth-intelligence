# Country flags

The tooltip loads `/flags/<iso2>.svg` and silently falls back to a monospace
country-code chip when the file is missing, so the UI is correct either way.

To populate (needs real network — run in Terminal, not inside Claude):

    cd public/flags
    for c in cn tw sa kr nl br jp us in ch de gb sg; do
      curl -sO "https://flagcdn.com/$c.svg"
    done

flagcdn.com is public domain. Do not use emoji flags: Windows Chrome renders
them as two grey letters.
