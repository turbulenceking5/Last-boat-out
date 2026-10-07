# 07. Findings

## Grade buckets in `tests/sim.js` don't match the game

The game grades at **58%, 46% and 32%** (`index.html` lines 564 and 878, and the README). The balance table in `tests/sim.js` line 20 counts runs at **62, 48 and 32**:

```js
const grades = [62, 48, 32].map(g => sc.filter(x => x >= g).length);
```

So the `>=62` and `>=48` columns in the balance output undercount top and middle grades. For example, a bot run scoring 47% earns the middle grade in the game but isn't counted in `>=48`. Likely left over from earlier tuning. Not changed in this session.

## No problems loading

The game loaded with no script errors and no failed requests from `file://`.
