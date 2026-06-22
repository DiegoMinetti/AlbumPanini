# Knockout Bracket Audit — FIFA World Cup 2026

**Fecha del estudio:** 2026-06-21 (MD1 + MD2 jugados, MD3 por empezar)
**Alcance:** revisión del bracket R32 / R16 del Mundial 2026 contra el formato
oficial FIFA, identificación de bugs en el código actual y propuesta de fix.

---

## 1. Cómo se forman las llaves según FIFA (fuente autoritativa)

El bracket oficial del Mundial 2026 está definido en el **Anexo C** del
reglamento oficial ("FIFA World Cup 2026 Regulations", publicado en el FIFA
Digital Hub). La estructura está reproducida en el artículo de Wikipedia
["2026 FIFA World Cup knockout stage"](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage).

### 1.1. Reglas generales

- 48 equipos → 12 grupos (A–L) de 4.
- Cada grupo juega round-robin de 3 fechas (single-leg).
- Clasifican al R32: **los 2 primeros de cada grupo (24) + los 8 mejores
  terceros (8) = 32**.
- Criterio de ranking entre terceros (todos los grupos, no por grupo):
  Pts → GD → GF → Fair-play → FIFA Ranking.
- Criterio de ranking dentro de un grupo (desempate): Pts → head-to-head Pts
  → head-to-head GD → head-to-head GF → GD general → GF general → Fair-play
  → FIFA Ranking.

### 1.2. Estructura del R32 (16 partidos, M73–M88)

El Anexo C de FIFA **no** publica una fórmula cerrada tipo
"`1A vs T1, 1B vs T2, …`". En su lugar publica una **tabla de 495
combinaciones** (C(12,8) = 495), una fila por cada subconjunto posible de 8
grupos cuyos terceros clasifican. Cada fila asigna explícitamente cuál
tercero va a cuál partido.

La razón: para cada ganador de grupo, su rival "mejor tercero" depende de
qué grupos' terceros están clasificando. Como cada ganador juega contra
*uno* de los terceros, y los 8 terceros van a 8 partidos distintos, la
asignación no es determinística sin conocer el set.

Por ejemplo, el partido **M79 (1A vs T)** admite terceros de los grupos
**{C, E, F, H, I}**, pero cuál de esos 5 ocupa el slot depende de cuáles
8 grupos pasaron.

### 1.3. Bracket "esqueleto" (asignación condicional, FIFA Annex C)

Reproducción del bracket de R32 tal como aparece en Wikipedia / FIFA (la
columna "Opción" indica qué grupo del conjunto de 5 es el que ocupa el
slot, según la fila del Anexo C):

| M#  | Local              | Visitante          | Notas                                                  |
| --- | ------------------ | ------------------ | ------------------------------------------------------ |
| 73  | 2º A               | 2º B               | runners-up                                             |
| 74  | 1º E               | 3º {A,B,C,D,F}     | ganador vs mejor tercero                               |
| 75  | 1º F               | 2º C               |                                                        |
| 76  | 1º C               | 2º F               | cruzados                                               |
| 77  | 1º I               | 3º {C,D,F,G,H}     | ganador vs mejor tercero                               |
| 78  | 2º E               | 2º I               | runners-up                                             |
| 79  | 1º A               | 3º {C,E,F,H,I}     | ganador vs mejor tercero                               |
| 80  | 1º L               | 3º {E,H,I,J,K}     | ganador vs mejor tercero                               |
| 81  | 1º D               | 3º {B,E,F,I,J}     | ganador vs mejor tercero                               |
| 82  | 1º G               | 3º {A,E,H,I,J}     | ganador vs mejor tercero                               |
| 83  | 2º K               | 2º L               | runners-up                                             |
| 84  | 1º H               | 2º J               |                                                        |
| 85  | 1º B               | 3º {E,F,G,I,J}     | ganador vs mejor tercero                               |
| 86  | 1º J               | 2º H               | cruzados                                               |
| 87  | 1º K               | 3º {D,E,I,J,L}     | ganador vs mejor tercero                               |
| 88  | 2º D               | 2º G               | runners-up                                             |

### 1.4. Round of 16 (M89–M96)

| M#  | Local          | Visitante       |
| --- | -------------- | --------------- |
| 89  | Ganador M73    | Ganador M75     |
| 90  | Ganador M74    | Ganador M77     |
| 91  | Ganador M76    | Ganador M78     |
| 92  | Ganador M79    | Ganador M80     |
| 93  | Ganador M81    | Ganador M82     |
| 94  | Ganador M83    | Ganador M84     |
| 95  | Ganador M85    | Ganador M86     |
| 96  | Ganador M87    | Ganador M88     |

### 1.5. Cuartos, semis y final

A partir del R16, el bracket es lineal y no tiene nada condicional:
- QF: M97 = W89 vs W90; M98 = W91 vs W92; M99 = W93 vs W94; M100 = W95 vs W96.
- SF: M101 = W97 vs W98; M102 = W99 vs W100.
- 3er puesto: M103 = L101 vs L102.
- Final: M104 = W101 vs W102.

---

## 2. Estado actual del código

El bracket está hardcodeado en `enrichment/src/build-fixture.ts:246-265` (que
genera `public/collections/worldcup-2026.json`) y los slots se resuelven en
`src/services/tournamentService.ts:214-249`.

### 2.1. Bracket actual (lo que produce el código hoy)

```
73  1A  vs T1          81  2A  vs 2B
74  1B  vs T2          82  2C  vs 2D
75  1C  vs T3          83  2E  vs 2F
76  1D  vs T4          84  2G  vs 2H
77  1E  vs T5          85  1I  vs 2J
78  1F  vs T6          86  1J  vs 2I
79  1G  vs T7          87  1K  vs 2L
80  1H  vs T8          88  1L  vs 2K
```

### 2.2. Diff vs FIFA

**R32: 15 de 16 partidos están mal.** Solo M73 (2A vs 2B) coincide.
Errores típicos:
- Se usa **T1..T8** (slots genéricos de "mejor tercero N-ésimo") sin
  condicionar por grupo de origen. FIFA usa "3º {A,B,C,D,F}" (un set
  específico de grupos elegibles).
- Aparecen partidos cruzados inventados (`2C vs 2D`, `2E vs 2F`, `2G vs 2H`,
  `1I vs 2J`, `1J vs 2I`, `1K vs 2L`, `1L vs 2K`) que **no existen** en el
  bracket oficial.
- Se asume una simetría simple `1X vs T_N`, cuando en realidad el
  ganador del grupo A puede jugar contra el 3º de C, E, F, H o I (5
  grupos candidatos).

**R16: 3 de 8 partidos están mal** (lado izquierdo del bracket):
- M89 actual = W73 vs **W74** — FIFA = W73 vs **W75**.
- M90 actual = **W75 vs W76** — FIFA = **W74 vs W77**.
- M91 actual = **W77** vs W78 — FIFA = **W76** vs W78.
- M92–M96: correctos.

**QF/SF/Final: correctos.**

### 2.3. Por qué pasó

El comentario en `build-fixture.ts:25-26` dice:

> "La combinación de 'mejores terceros' sigue el ordenamiento T1..T8 estándar
> publicado por FIFA."

Ese "estándar" no existe como fórmula cerrada. FIFA lo que publica es la
tabla de 495 combinaciones. Asumir que T1 siempre va con 1A, T2 con 1B, etc.
es incorrecto y lleva a 15/16 partidos del R32 mal asignados.

Además, la pareja del R16 del lado izquierdo (M89–M91) también está mal,
probablemente porque se asumió "los dos primeros partidos del R32 se cruzan
con los dos siguientes" (W73→W74→W75→W76 secuencial), cuando en realidad el
bracket oficial cruza M73 con M75 (no con M74), y M76 con M78.

### 2.4. Impacto

Hoy el album permite al usuario "elegir" qué equipo gana cada llave, y el
resolver en `tournamentService.ts` mapea correctamente cualquier equipo a
cualquier slot. Eso significa que **funcionalmente la app no está rota**
porque los slots son simbólicos — pero **el bracket visual está
incorrecto** desde el punto de vista pedagógico y de fidelidad al torneo
real, y los siguientes problemas sí son tangibles:

1. **Cualquier persona con conocimiento real del Mundial 2026 ve que la
   llave está mal** y pierde confianza en el producto.
2. **Cuando llegue la fase eliminatoria real, las llaves visualizadas
   no van a coincidir con las de FIFA** — un desfasaje que rompe la
   experiencia de "seguir el Mundial en el álbum".
3. **El scoring depende de `homeSlot`/`awaySlot`** (ver
   `scoringService.ts:169-211`): si los slots no coinciden con los de
   FIFA, los puntos por acertar cruces podrían no estar bien calibrados.

---

## 3. Fix propuesto

### 3.1. Cambios en datos (`enrichment/src/build-fixture.ts` + JSON generado)

Sustituir el array `r32` (líneas 247-265) por la tabla del Anexo C de
FIFA. Como los slots de "mejor tercero" tienen **5 grupos elegibles** (no
1), la representación simbólica tiene que cambiar.

**Opción A — Codificar los 5 grupos elegibles explícitamente:**

```ts
// Antes: 'T1', 'T2', ..., 'T8'  (slot genérico)
// Ahora: '3CEFHI' (string con grupos elegibles concatenados, orden FIFA)

const r32: Array<[string, string]> = [
  ['2A',  '2B'],
  ['1E',  '3ABCDF'],   // 3º de {A,B,C,D,F}
  ['1F',  '2C'],
  ['1C',  '2F'],
  ['1I',  '3CDFGH'],   // 3º de {C,D,F,G,H}
  ['2E',  '2I'],
  ['1A',  '3CEFHI'],   // 3º de {C,E,F,H,I}
  ['1L',  '3EHIJK'],   // 3º de {E,H,I,J,K}
  ['1D',  '3BEFIJ'],   // 3º de {B,E,F,I,J}
  ['1G',  '3AEHIJ'],   // 3º de {A,E,H,I,J}
  ['2K',  '2L'],
  ['1H',  '2J'],
  ['1B',  '3EFGIJ'],   // 3º de {E,F,G,I,J}
  ['1J',  '2H'],
  ['1K',  '3DEIJL'],   // 3º de {D,E,I,J,L}
  ['2D',  '2G'],
];
```

Y arreglar el R16 lado izquierdo:

```ts
// Antes:
//   for (let i = 0; i < 8; i += 1) add(89 + i, 'r16', `W${73 + i * 2}`, `W${74 + i * 2}`, ...);
// Ahora (FIFA):
const r16_pairs: Array<[number, string, string]> = [
  [89, 'W73', 'W75'],
  [90, 'W74', 'W77'],
  [91, 'W76', 'W78'],
  [92, 'W79', 'W80'],
  [93, 'W81', 'W82'],
  [94, 'W83', 'W84'],
  [95, 'W85', 'W86'],
  [96, 'W87', 'W88'],
];
```

### 3.2. Cambios en el resolver (`src/services/tournamentService.ts`)

Dos cambios:

1. **Detectar slot de mejor tercero por set de grupos.** El regex actual
   `/^T(\d+)$/` ya no alcanza — hay que aceptar `^3([A-L]+)$` (string de
   letras) y `^3-([A-L]+)$` (con guión, alternativa).

2. **Resolver el slot.** Cuando un slot es `3ABCDF`, el resolver debe:
   - Calcular los 8 mejores terceros (ya lo hace
     `computeAllStandings()`).
   - Entre los 5 grupos del set, ver cuál(es) están dentro del top-8.
   - Si hay uno solo, ese es el equipo. Si hay más de uno, hay que
     desambiguar usando la fila del Anexo C correspondiente al set de
     grupos que efectivamente está clasificando.

   La desambiguación final con la tabla del Anexo C es lo más
   complejo. Hay dos rutas:

   **Ruta simple (recomendada para MVP):** mostrar el slot como "uno de
   los 8 mejores terceros entre {A,B,C,D,F}" y dejar que el usuario elija
   manualmente entre los elegibles. El resolver devuelve el equipo solo
   cuando hay uno inequívoco. Esto es lo que hace FIFA con su
   `Match for 3rd place = L101 vs L102` — la asignación final es
   determinista una vez que se conocen los resultados.

   **Ruta completa:** implementar la tabla del Anexo C como una matriz
   `Map<Set[str], Array[Tuple[int, str, str, str, str, str, str, str]]>`
   (495 filas × 8 columnas) y consultar por `currentBestThirdsSet`. Más
   correcto pero ~500 filas de datos para mantener.

### 3.3. Cambios en UI (`BracketView.tsx`, `KnockoutMatchRow.tsx`)

Cuando un slot es un "mejor tercero condicional", mostrar la lista de
grupos elegibles como hint: `3º de {A, B, C, D, F}` (en lugar de solo
"T1"). Estoeduca al usuario sobre la mecánica del nuevo formato.

### 3.4. Migración

El JSON de collection se regenera con `node enrichment/dist/build-fixture.js`
o `pnpm build:fixture`. No hay migration de DB porque los slots simbólicos
nunca persisten nombres concretos en `knockoutPicks` — solo el teamId que
eligió el usuario.

---

## 4. Proyección: equipo más probable por slot

**Asunciones:**
- Standings a MD2 cerrado (19 jun 2026).
- MD3 proyectado con la heurística "equipo con más puntos gana su último
  partido; desempates por GD actual". Las proyecciones están marcadas
  como aproximadas.
- Best-thirds rankeados por Pts → GD → GF (mismo comparator que
  `tournamentService.ts:63`).

### 4.1. Best 3rds proyectados

| Rank | Grupo | Equipo (proyección) | Pts (MD3 estimado) |
| ---- | ----- | ------------------- | ------------------ |
| T1 ✓ | D     | Paraguay            | 6 |
| T2 ✓ | C     | Escocia             | 5 |
| T3 ✓ | I     | Senegal             | 5 |
| T4 ✓ | E     | Costa de Marfil     | 4 |
| T5 ✓ | F     | Japón               | 4 |
| T6 ✓ | G     | Irán                | 3 |
| T7 ✓ | H     | Arabia Saudita      | 3 |
| T8 ✓ | A     | Chequia             | 2 |
| T9 ✗ | K     | Uzbekistán          | 2 |
| T10 ✗ | J    | Argelia             | 2 |
| T11 ✗ | L    | Croacia             | 1 |
| T12 ✗ | B    | Bosnia y Herz.      | 0 |

### 4.2. R32 — equipo más probable por slot (bracket FIFA)

| M#  | Local              | Local (proj.)      | Visitante             | Visitante (proj.) |
| --- | ------------------ | ------------------ | --------------------- | ----------------- |
| 73  | 2º A               | Corea del Sur      | 2º B                  | Suiza             |
| 74  | 1º E               | Alemania           | 3º {A,B,C,D,F}        | Chequia (A)       |
| 75  | 1º F               | Suecia             | 2º C                  | Marruecos         |
| 76  | 1º C               | Brasil             | 2º F                  | Países Bajos      |
| 77  | 1º I               | Francia            | 3º {C,D,F,G,H}        | Escocia (C)       |
| 78  | 2º E               | Ecuador            | 2º I                  | Noruega           |
| 79  | 1º A               | México             | 3º {C,E,F,H,I}        | Escocia (C)       |
| 80  | 1º L               | Inglaterra         | 3º {E,H,I,J,K}        | Costa de Marfil (E)|
| 81  | 1º D               | Estados Unidos     | 3º {B,E,F,I,J}        | Costa de Marfil (E)|
| 82  | 1º G               | Bélgica            | 3º {A,E,H,I,J}        | Chequia (A)       |
| 83  | 2º K               | Portugal           | 2º L                  | Ghana             |
| 84  | 1º H               | España             | 2º J                  | Austria           |
| 85  | 1º B               | Canadá             | 3º {E,F,G,I,J}        | Costa de Marfil (E)|
| 86  | 1º J               | Argentina          | 2º H                  | Uruguay           |
| 87  | 1º K               | Colombia           | 3º {D,E,I,J,L}        | Paraguay (D)      |
| 88  | 2º D               | Australia          | 2º G                  | Egipto            |

**Nota importante:** la proyección es naïve — muestra *qué equipo tiene
más probabilidad* de ocupar cada slot de "mejor tercero" según los puntos
actuales, pero **en el escenario real FIFA, los 8 terceros clasifican
una sola vez cada uno**. Como la tabla del Anexo C es lo que decide la
asignación final, la proyección real solo se conocerá cuando termine MD3
(24-27 jun). Mientras tanto, los slots condicionales pueden mostrar
el mismo equipo en varios partidos (p.ej. Costa de Marfil aparece en 3
slots) — esto refleja que ella es *candidata* para esos slots, no que
los vaya a jugar todos.

---

## 5. Recomendación

**Prioridad: media-alta.** No es bloqueante para producción (la app
funciona), pero la fidelidad con el Mundial real es importante porque es
la propuesta de valor del álbum.

**Plan sugerido (3 PRs pequeños, alineado con la preferencia de PRs
cortas con OK explícito):**

1. **PR A — Fix de datos (1 archivo):** cambiar el array `r32` y los
   pares `r16` en `enrichment/src/build-fixture.ts` para que coincidan
   con FIFA. Regenerar `worldcup-2026.json`. Sin cambios de runtime.
   Riesgo: muy bajo. Verificable con diff visual del bracket.
2. **PR B — Extender el resolver (2 archivos):** aceptar el nuevo
   formato `3[A-L]+` en `tournamentService.ts`. Tests unitarios para
   los 16 partidos del R32 contra la tabla del Anexo C (al menos 5
   filas de las 495). Sin UI changes.
3. **PR C — UI del bracket:** que `BracketView.tsx` muestre el set de
   grupos elegibles cuando un slot es de "mejor tercero condicional".
   Opcional: tooltip explicando "por qué este partido puede tener varios
   rivales".

Cada PR se puede validar con `pnpm test` + `pnpm build` + diff visual
del bracket en el browser. No requiere docker porque no toca backend.

---

## Apéndice A — Fuentes

- [Wikipedia: 2026 FIFA World Cup knockout stage](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage) — tabla de 495 combinaciones reproducida del Anexo C.
- [FIFA: World Cup 2026 Regulations PDF](https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf) — fuente autoritativa del Anexo C.
- [FIFA: Standings](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings) — standings oficiales en tiempo real.
- [Sports StackExchange: How will 3rd place finishers be assigned to brackets?](https://sports.stackexchange.com/questions/30289) — buena discusión del problema de las 495 combinaciones.
- [FOX Sports: World Cup Group Scenarios](https://www.foxsports.com/stories/soccer/2026-world-cup-group-scenarios-what-each-team-needs-advance-round-32) — snapshot de escenarios al 19 jun.

## Apéndice B — Archivos tocados por el fix

```
enrichment/src/build-fixture.ts   ← cambiar array r32 y r16_pairs
public/collections/worldcup-2026.json   ← regenerar (output)
src/services/tournamentService.ts ← regex de slot + branch "best3rd-set"
src/services/tournamentService.test.ts ← nuevos tests
src/components/tournament/BracketView.tsx ← UI hint
src/components/tournament/KnockoutMatchRow.tsx ← mostrar set elegible
```
