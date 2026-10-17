# ifta

Granițele statelor SUA pentru unealta IFTA (calcul mile pe stat din coordonate GPS + rute OSRM).

`scripts/build-states.mjs` descarcă granițele publice (US Census / GeoJSON), le simplifică la ~300 m și le publică pe ramura `data`:

- `https://raw.githubusercontent.com/DenisPr0/ifta/data/us-states.json` — 52 jurisdicții (50 state + DC + PR), ~75 KB
- `https://raw.githubusercontent.com/DenisPr0/ifta/data/meta.json`

Granițele statelor nu se schimbă des, așa că workflow-ul rulează o dată pe trimestru (sau manual din Actions).

Date © US Census Bureau (domeniu public).
