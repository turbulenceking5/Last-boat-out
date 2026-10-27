# The map

The city is 74 by 70 cells. Roads 2 cells wide run every 8 cells; between them are 9 by 7 blocks of 6 by 6 cells. The quay runs along the south (rows 58 to 63) with the sea beyond. Streets, bridges, parks, the market square, the quay and Fort Aldermoor are walkable; buildings and water are not.

The map is the same every game: the streets, the river, the landmarks, the block names and how many people live in each block all come from a fixed seed (`20261027`). The outbreak, its timing and the missions vary with the game's seed (add `#seed=123` to the address to replay one).

## The River Calder

The river runs north to south through columns 55 to 58, from the top of the map to the sea, where it cuts through the quay. The blocks on either bank are one cell narrower (5 by 6) to make room for it. Four bridges cross it:

| Bridge | Rows | Carries |
|---|---|---|
| North | 8 to 9 | A 2-cell street |
| Hospital | 24 to 25 | A 2-cell street, just south of St Brennan's |
| South | 40 to 41 | A 2-cell street |
| Harbour | 56 to 59 | The last street and the quay, 4 cells wide |

The other streets that reach the river (rows 0, 16, 32 and 48) end at a parapet. Everything east of the river, the hospital where the outbreak starts, the industrial east, and the streets the great horde pours in from, can only reach the rest of the city over these bridges. That makes them the chokepoints to hold: a squad on a 2-cell bridge faces the infected in single file. The east side holds only about 2,300 people, so you can afford to evacuate it early and fight at the water.

## Districts

| District | Where | People per block (±20%) | Buildings |
|---|---|---|---|
| Downtown | The middle (columns 3 to 5, rows 2 to 4) | about 1,400 | Towers with setback crowns, slim towers on podiums, L-shaped offices round corner plazas |
| Residential | Most of the west and centre | about 900 | Perimeter blocks round a courtyard, terraces of townhouses with back gardens, L-shaped blocks, or four apartment blocks |
| Suburbs | The northern row and the western column | about 380 | Houses with gardens, hedges and trees |
| Industrial | The two eastern columns, across the river | about 140 | Sawtooth works sheds with chimneys, gasholders in their frames, sheds and fuel tanks |
| Docks | The southern row | about 220 | Warehouses, container yards, transit sheds |
| Parks | Victory Park (centre), Millbrook Park (west) and Market Square | none | Walkable |
| Fort Aldermoor | North-west corner | none | Barracks, helipad, sandbags; where units arrive |

Flat roofs carry air handlers and water tanks. The whole city holds about 37,500 people.

## Landmarks

| Landmark | Block (column, row) | People | What it is |
|---|---|---|---|
| St Brennan's Hospital | 7, 2 | about 700 | An H of white wards with a red cross on the roof and ambulances at the doors. The outbreak starts here, across the river |
| Calder Cathedral | 3, 3 | about 1,200 | Twin west towers, a nave and transept, an apse and a green spire over the crossing; people shelter in the nave |
| City Hall | 3, 4 | about 1,400 | A low domed hall with a portico, so the cathedral can be seen from the south |
| Market Square | 2, 3 | none | A cobbled square, walkable, with a fountain and four stalls you have to go round. You can put a bus point here |
| Victory Park | 4, 3 | none | Trees, paths, a monument and a pond (not walkable). The great horde heads for the cell beside the pond, (37, 30) |
| Millbrook Park | 1, 4 | none | Woods and a bandstand |
| Calder Park Stadium | 5, 0 | about 1,400 | An oval of stands round the pitch, with floodlights; people shelter in the stands |
| Central Station | 0, 3 | about 800 | Platform canopies, two trains, a booking hall with a clock tower, and the railway running out west |
| The harbour | Quay, (37, 60) | | The main evacuation point; a freighter docks and sails. Four gantry cranes work the quay, and a lighthouse stands on the mole to the east |
| Fort Aldermoor | 0, 0 | | Your base. Bought infantry, APCs and tanks drive out from cell (5, 5) |

## Street dressing and the outskirts

- **Street trees** line the High Street (rows 32 to 33) and Kings Parade (columns 32 to 33).
- **Abandoned cars**, some burnt out, are parked along the kerbs or slewed across the lanes. They are scenery: nothing collides with them.
- **The outskirts**, beyond the map edge, are scenery too: suburbs thinning into farmland to the north, west and east, the city's streets carried on out of town, the river running in from the north, the railway out to the west, and a jam of abandoned cars on the road east, where the horde comes from.
