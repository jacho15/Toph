# Toph Dashboard — Figma Design Spec

Source: Figma file `nvpGmK1je0QsesXtZcBdjg` ("F26 Dev Challenge Figma"), page "Page 1".
Two frames, both named "Dashboard":

| Frame | Node ID | Size |
|---|---|---|
| DEFAULT VIEW (logs table collapsed) | `1:1481` | 1676 × 955 |
| EXPANDED ENTRY (first row expanded) | `1:762` | 1676 × 955 |

Both frames: fill `#ffffff`, outer auto-layout `HORIZONTAL`, gap `10`, padding `10` on all sides (sidebar + main content sit inside this 10px frame padding).

Font family (exactly as Figma reports it): **`Geist`** (PostScript names `Geist-Regular` / `Geist-Medium` / `Geist-SemiBold`). All text has `letter-spacing: 0`. Line-height is always Figma's "Auto" (`lineHeightPercent: 100`, i.e. ~130% of font size) — use the px value given per style, not a percentage.

Reference frame renders (scale 2 PNG) are in `public/figma/ref-default.png` and `public/figma/ref-expanded.png` — use them for pixel comparison.

---

## 1. Overall Layout

- Sidebar ("Toph Navigation Bar" instance): `x=10, y=10`, size **280 × 935**, corner radius **16**, fill `#ffffff`, 1px border = `linear-gradient(to bottom, #a6a6a6 0%, #595959 100%)` at **15% opacity** (i.e. a very faint vertical gray gradient border), internal auto-layout `VERTICAL`, gap `10`, padding `10` all sides.
- Main content ("Main Dash" instance): starts at `x=300` (10 sidebar margin + 280 width + 10 gap), width **1366**, height 935. Internal auto-layout `VERTICAL`, gap `10`, padding **0 top/bottom, 30 left/right**. So real content left edge = `330` from frame edge.
- Main content children, top to bottom, each full width (1306px):
  1. Header row (height 87): page title/subtitle + search bar
  2. Stat cards row (height 115), gap 10 between main content sections
  3. Logs card (height 364 in DEFAULT, 713 in EXPANDED — grows to fit the expanded panel)

---

## 2. Sidebar

- Container: 280×935, radius 16, fill `#ffffff`, border as above, padding 10, vertical gap 10 between sections.
- **Top brand row** ("Frame 152"): 260×50, radius 4, fill none, padding `4/14/4/4` (T/R/B/L), `space-between` + center.
  - Avatar: `Ellipse 11`, **42×42**, circular, image fill (`public/figma/avatar.png`), inner shadow `0 3px 4.5px rgba(0,0,0,0.10)`.
  - Farm name "Bays Ranch": Geist Medium 14 / 18.2px line-height, color `#000000`.
  - Role row: `user-star` icon (10×10, stroke `#808080`, w1) + "Admin" text: Geist Medium 14/18.2px, color `#808080`. Gap 5.
  - Inbox icon button (top-right): `inbox`, 16×16, stroke `#4d4d4d`.
- **Nav sections**, each: label row (height 21, padding `4/10/4/10`) + stacked nav buttons (gap 4 between buttons, 25px gap from label to first button... actually consistent 4px section gap, buttons packed at 42px pitch).
  - Section label style: Geist Medium **10px** / 13px line-height, color `#b3b3b3` (uppercase text, typed in caps — no `text-transform` override in Figma, `textCase: ORIGINAL`).
  - Sections & items (label → items, in order):
    - **OVERVIEW** → Dashboard (`chart-line`, active), Activity Logs (`audio-lines`), Map (`map`)
    - **COMPLIANCE** → Audit Manager (`book-check`), Reports (`files`), Schedule (`calendar`)
    - **TEAM MANAGEMENT** → Employees (`users`), Performance (`chart-pie`), Messages (`mail`)
    - **OTHER** → Settings (`cog`), Support (`handshake`)
  - Nav button ("Button" frame): height **38**, radius **4**, padding `10/14/10/14`, gap 14 between icon and label, icon **16×16**.
    - Inactive: fill none, icon stroke `#4d4d4d`, label Geist Regular 14/18.2px color `#000000`.
    - **Active** ("Dashboard"): fill `#000000` at **5% opacity** (i.e. `rgba(0,0,0,0.05)`), `space-between` layout to push a badge to the right. Icon/label same style as inactive (icon stroke stays `#4d4d4d`, not recolored).
    - **Badge** (on "Dashboard" only): pill 20×14, radius 50, fill `#019c25` @ 50% opacity, border `#006939` @ 26% opacity width 0.5. Text "1": Geist Medium 10/13px, centered, color `#ffffff`.
- **Bottom items** (outside the scrollable nav, pinned near bottom of sidebar): "Switch User" (`arrow-right-left`) at `y=849`, "Log Out" (`log-out`) at `y=897`. Same 260×38 Button style as nav items, fill none, icon+text same as inactive nav item.

---

## 3. Header

- Title "Dashboard": Geist SemiBold **20px** / 26px line-height, color `#000000`.
- Subtitle "An overview of your farm and employee activity": Geist Regular **16px** / 20.8px, color `#4d4d4d`.
- Search input (top right, 370×34 container, actual field 370×34): fill `#ffffff`, border `#e6e6e6` 1px, radius **30** (pill), shadow `0 0 4px rgba(0,0,0,0.05)`, padding `8/16/8/16`, gap 10.
  - Icon: `search`, 16×16, stroke `#cccccc`.
  - Placeholder "Search": Geist Regular 14/18.2px, color `#cccccc`.

---

## 4. Stat Cards

Row of 3 cards, each **429 × 115**, gap **10** between cards, radius **14**, border `#f2f2f2` width **0.88**, no fill declared (inherits page white), padding **20** all sides, internal vertical gap 20 (icon+label row → value row).

- Icon+label row: icon **16×16** (black stroke `#000000`, note: black here, not gray like sidebar icons), gap 8, label Geist Regular **16px**/20.8px, color `#000000`.
- Value row (bottom-aligned / `counter=MAX`): big number Geist Medium **48px** / 62.4px line-height, color `#000000`, gap 20 to any trailing text.
- Cards (left → right):
  1. **Todays Recordings** (`calendar`) — value **"5"**, trailing text **"1 New"** (Geist Regular 14/18.2px, color `#000000`, plain text — no pill/badge background).
  2. **Active Workers** (`clipboard-pen`) — value **"12"**, no trailing text.
  3. **Response Accuracy** (`percent`) — value **"90"**, no trailing text (implied "%").

---

## 5. Logs Card

Container **1306 × 364** (DEFAULT) / **1306 × 713** (EXPANDED), fill `#ffffff`, border `#f2f2f2` width 1, radius **20**, vertical auto-layout, no padding (children manage their own).

### Header row (74px tall)
- Padding `20/30/20/30`, `space-between`, border-bottom only `#f2f2f2` 1px.
- Left: `audio-lines` icon (16×16, black) + "New Employee Logs (4)": Geist Regular 16/20.8px. The whole string is `#000000` **except** the trailing `(4)` substring, which is colored **`#b3b3b3`** (confirmed via Figma character style override) — style it as two spans.
- Right: 4 filter chips, gap 10, all pill radius **80**, height 34, padding `8/16/8/16`, shadow `0 0 4px rgba(0,0,0,0.05)`, gap 10 (icon↔label), icon 16×16:
  - **"× Date"** — filled black chip: fill `#000000`, border `#e6e6e6` 1, icon `x` (16×16, stroke `#ffffff`), text `#ffffff` 14/18.2px.
  - **"Sort"** — outlined chip: fill `#ffffff`, border `#e6e6e6` 1, icon `list-filter` (stroke `#4d4d4d`), text `#4d4d4d` 14/18.2px, no leading icon-x.
  - **"× This Month (4)"** — filled black chip, same as Date chip (icon `x`, text `#ffffff`). Note: DEFAULT view's node has literal characters "This Month" only in one text run but the full displayed string (per `characters`) is **"This Month (4)"**.
  - **"Filter"** — outlined chip, icon `funnel` (stroke `#4d4d4d`), text `#4d4d4d`.

### Column header row (58px tall)
- Fill none, border-bottom only `#e6e6e6` 1px (darker than row dividers), padding `0/20/0/20`, `space-between`.
- Checkbox column: 56px wide (20px padding either side of a 16×16 checkbox), `square` icon unchecked, stroke `#4d4d4d`, rounded corners (vector, ~4px visual radius), stroke width 1.33.
- Text columns, each cell padding `20/10/20/10`, label style Geist Regular **14px**/18.2px, color `#4d4d4d`. Text is typed in caps in Figma (no `text-transform`, `letter-spacing: 0`): **EMPLOYEE, ACTIVITY, DATE, FIELD, TIME**.
- "View All" button (far right, 92px column, centered): pill 84×34, radius 4 (not fully round like the filter chips), fill `#ffffff`, border `#e6e6e6` 1, shadow `0 0 4px rgba(0,0,0,0.05)`, text `#4d4d4d` 14/18.2px.

### Column x-positions / widths (relative to card left edge, i.e. includes the 20px row padding)

| Column | x | width |
|---|---|---|
| Checkbox | 20 | 56 |
| Employee | 76 | 224 |
| Activity | 300 | 224 |
| Date | 523 | 224 |
| Field | 747 | 224 |
| Time | 970 | 224 |
| View/Close action | 1194 | 92 |

### Table rows

- Row height **58px**, divider = border-bottom only `#f2f2f2` 1px (all rows including the last visible one; header uses the darker `#e6e6e6`).
- **Row 1 background is `#f8f8f8`** (both in DEFAULT and EXPANDED view) — this is the "expanded/active" row highlight color; rows 2+ have no fill (transparent, showing card white). Use `#f8f8f8` as the hover/expanded-row background.
- Cell text: Geist Regular 14/18.2px, color `#4d4d4d`, padding `20/10/20/10` per cell.
- Row action button (right column): pill 64×34, radius **80**, fill `#ffffff`, border `#f2f2f2` (row1 in EXPANDED uses `#f2f2f2` too, DEFAULT row1's button border is `#e6e6e6`), shadow `0 0 4px rgba(0,0,0,0.05)`, text `#4d4d4d` 14/18.2px. Label is **"View"** normally, **"Close"** on the expanded row (69×34, slightly wider to fit the longer word).
- The design layer tree actually contains **11 data rows** in the "New Employee Logs" table (only ~4 are visible within the 1676×955 frame viewport before it clips/scrolls) — build the table as a scrollable list, not a fixed 4-row grid. Full row data below.

**Table data (Employee / Activity / Date / Field / Time):**

| # | Employee | Activity | Date | Field | Time |
|---|---|---|---|---|---|
| 1 | Isaac Wang | Spraying | April 19, 2026 | FIELD A | 6:00 AM - 10:40 AM |
| 2 | Maya Patel | Harvesting | April 20, 2026 | FIELD B | 7:30 AM - 11:15 AM |
| 3 | Liam Johnson | Planting | April 21, 2026 | FIELD C | 8:00 AM - 12:00 PM |
| 4 | Sophia Lee | Irrigation | April 22, 2026 | FIELD D | 6:30 AM - 9:30 AM |
| 5 | Ethan Kim | Fertilizing | April 23, 2026 | FIELD E | 5:45 AM - 9:00 AM |
| 6 | Olivia Martinez | Weeding | April 24, 2026 | FIELD F | 6:15 AM - 10:00 AM |
| 7 | Noah Brown | Pruning | April 25, 2026 | FIELD G | 7:00 AM - 11:30 AM |
| 8 | Emma Davis | Monitoring | April 26, 2026 | FIELD H | 8:15 AM - 12:45 PM |
| 9 | James Wilson | Soil Testing | April 27, 2026 | FIELD I | 6:00 AM - 9:00 AM |
| 10 | Isabella Garcia | Seeding | April 28, 2026 | FIELD J | 7:45 AM - 11:00 AM |
| 11 | Benjamin Moore | Pest Control | April 29, 2026 | FIELD K | 6:30 AM - 10:30 AM |

(Row 1, Isaac Wang, is the row shown expanded in the EXPANDED ENTRY frame.)

---

## 6. Expanded Panel (row 1 only, EXPANDED ENTRY frame)

Panel container ("Frame 148"): full row width 1306 × 477, fill `#ffffff`, `HORIZONTAL` layout, gap **40**, padding **40** all sides, centered. Two columns, each ~592-594px wide, gap 20 between children within each column.

### Left column (592 × 397) — waveform, transcript actions, summary

- **Waveform** ("Group 1"): 592 × 81 area made of ~97 individual `LINE` vectors (vertical bars), stroke width **0.88px**, round caps.
  - **Played** bars (left portion, up to ~56% across = x≈700 of the 592-wide group): color **`#003930`** (dark green), full opacity. Heights vary ~7–63px, roughly centered vertically (waveform look).
  - **Unplayed** bars (right portion): color **`#01382f`** at **25% opacity**.
  - **Playhead**: one full-height (81px) vertical line at the played/unplayed boundary, color `#003930` solid — render as a distinct playhead indicator, not just another bar.
- **Play Recording button** ("Frame 117"): 592×42, fill `#ffffff`, border `#000000` @ 10% opacity width 1, radius **7.04**, padding `10.56/8.8/10.56/8.8`, centered content, gap 10. Icon `play` 16×16 stroke `#000000`. Text "Play Recording": Geist Regular 16/20.8px, color `#000000`.
- **Add Tag button** ("Frame 118"): 592×42, fill `#146c44` @ 10% opacity, border `#146c44` @ 10% opacity width 1, radius 7.04, same padding/gap as Play button. Icon `star` 16×16 stroke `#146c44`. Text "Add Tag": Geist Regular 16/20.8px, color **`#146c44`** (full opacity, unlike its translucent background).
- **Summary block**:
  - Label "Summary": Geist Regular 16/20.8px, color `#000000`.
  - Body text, Geist Regular 16/20.8px, color `#000000`, gap 4 below the label. Full exact content:
    > "Offline guided voice log created at 2026-04-08T22:01:01.711Z. Question (activity_type): What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance? Answer: I'm leaving first, I'm going to go home. Question (field_block): Where were you working (field, block, or area)? Answer: yes, in one part and then 130 and 200 yes, and 130 for uh 160 and no, this yes no, no, uhm no no I remember, uhm uhm uhm, no, I don't remember anything."

### Right column (594 × 397) — satellite map

- Map card ("Frame 121"): 594 × 335, radius **14**, border `#e9e9e9` width 0.88, padding 20 all sides (padding appears unused visually since the image fills the card), bottom-aligned content (`counter=MAX`).
  - Fill = two stacked IMAGE fills: base image is a near-blank/transparent placeholder (`map-satellite-placeholder-bg.png`, likely a loading/fallback background), the visible satellite photo is the second image (`map-satellite.png`), applied with `scaleMode: STRETCH` and a transform placing it inset within the card (scale ≈0.855×0.866, offset ≈14.5%/6.5%) — i.e. the photo is slightly zoomed/cropped to fill, not shown edge-to-edge raw.
  - Overlay marker: a rounded rectangle **88×52**, radius 14, fill `#0065f0` @ 20% opacity, border `#0065f0` 1px (a highlighted "field" region), plus a **17×17** circular pin marker with `linear-gradient(#0065f0 → #00d4f0)` fill, white 2px border, and a large soft blue drop-shadow (`0 0 39.5px #0065f0`), positioned near the bottom-right of the highlighted region.
- **Expand Map button** ("Frame 117", reused button style): 594×42, fill `#ffffff`, border `#000000` @ 10% opacity width 1, radius 7.04, padding `10.56/8.8/10.56/8.8`, centered. Icon `expand` 16×16 stroke `#000000`. Text "Expand Map": Geist Regular 16/20.8px, color `#000000`.

### Row header when expanded

The expanded row's own header cell (Frame 161 equivalent) keeps the `#f8f8f8` background, and its action button becomes **"Close"** (69×34 pill, same style as "View").

---

## 7. Consolidated Palette

| Color | Used for |
|---|---|
| `#000000` | Primary text (headings, active nav text, stat values, sidebar farm name), black filled chip/badge backgrounds, black button borders (10% opacity variants) |
| `#ffffff` | Card/sidebar/search/button fills, text-on-black (chips), text-on-dark-green (badge "1") |
| `#4d4d4d` | Secondary text (nav icons stroke, header subtitle, table cell text, chip "Sort/Filter" text, column headers, view/close button text) |
| `#808080` | "Admin" role text, user-star icon stroke |
| `#b3b3b3` | Sidebar section labels (OVERVIEW etc.), the "(4)" count in "New Employee Logs (4)" |
| `#cccccc` | Search placeholder text + search icon stroke |
| `#e6e6e6` | Search/chip/button borders, column-header-row bottom border |
| `#f2f2f2` | Stat card borders, logs card border, row dividers, some row-action-button borders |
| `#f8f8f8` | Highlighted/expanded/first table row background |
| `#e9e9e9` | Map card border |
| `#019c25` @ 50% / `#006939` @ 26% | Sidebar notification badge (pill "1") fill/border |
| `#003930` | Waveform "played" bars + playhead |
| `#01382f` @ 25% | Waveform "unplayed" bars |
| `#146c44` | Add Tag button text/icon (full opacity), background/border (10% opacity) |
| `#0065f0` → `#00d4f0` (gradient) | Map pin marker fill |
| `#0065f0` @ 20% | Map highlighted-region overlay fill |
| `#a6a6a6` → `#595959` (gradient, 15% opacity) | Sidebar outer border |

## 8. Typography Scale

| Style | Font | Weight | Size | Line-height | Used for |
|---|---|---|---|---|---|
| Section label | Geist Medium | 500 | 10px | 13.0px | Sidebar OVERVIEW/COMPLIANCE/etc., badge "1" |
| Small body | Geist Regular / Medium | 400/500 | 14px | 18.2px | Nav items, farm name/role, search placeholder, table cells & headers, chip labels, View/Close/Sort/Filter buttons |
| Body | Geist Regular | 400 | 16px | 20.8px | Header subtitle, stat card labels, logs card title, chip-less body text (Play Recording, Add Tag, Summary, Expand Map) |
| Heading | Geist SemiBold | 600 | 20px | 26.0px | Page title "Dashboard" |
| Stat value | Geist Medium | 500 | 48px | 62.4px | Stat card big numbers (5, 12, 90) |

All styles: `letter-spacing: 0`, `text-align: left` (badge "1" is center-aligned).

---

## 9. Icon Inventory (layer names → suggested `lucide-react` import)

Figma icon instance names match Lucide's icon names almost exactly (kebab-case → PascalCase import):

| Figma layer name | Size | Context | Lucide component |
|---|---|---|---|
| `chart-line` | 16×16 | Dashboard nav item | `ChartLine` |
| `audio-lines` | 16×16 | Activity Logs nav item, logs card header, Play button | `AudioLines` |
| `map` | 16×16 | Map nav item | `Map` |
| `book-check` | 16×16 | Audit Manager nav item | `BookCheck` |
| `files` | 16×16 | Reports nav item | `Files` |
| `calendar` | 16×16 | Schedule nav item, stat card "Todays Recordings" | `Calendar` |
| `users` | 16×16 | Employees nav item | `Users` |
| `chart-pie` | 16×16 | Performance nav item | `ChartPie` |
| `mail` | 16×16 | Messages nav item | `Mail` |
| `cog` | 16×16 | Settings nav item | `Cog` |
| `handshake` | 16×16 | Support nav item | `Handshake` |
| `arrow-right-left` | 16×16 | Switch User | `ArrowRightLeft` |
| `log-out` | 16×16 | Log Out | `LogOut` |
| `user-star` | 10×10 | Role/"Admin" indicator | `UserStar` |
| `inbox` | 16×16 | Sidebar top-right | `Inbox` |
| `search` | 16×16 | Search input | `Search` |
| `clipboard-pen` | 16×16 | Stat card "Active Workers" | `ClipboardPen` |
| `percent` | 16×16 | Stat card "Response Accuracy" | `Percent` |
| `x` | 16×16 | "Date"/"This Month" chip close icon | `X` |
| `list-filter` | 16×16 | "Sort" chip | `ListFilter` |
| `funnel` | 16×16 | "Filter" chip | `Funnel` |
| `square` | 16×16 (12×12 glyph) | Row/column checkbox (unchecked) | `Square` |
| `play` | 16×16 | Play Recording button | `Play` |
| `star` | 16×16 | Add Tag button | `Star` |
| `expand` | 16×16 | Expand Map button | `Expand` |

All icons render at a uniform **16×16** frame (except `user-star` at 10×10), stroke width ~1.33px (2px at Lucide's native 24px grid, scaled to 16px = `strokeWidth={2}` default works fine), and use `currentColor`-style single-color strokes (no fills) — colors per-instance are listed in the sections above (mostly `#4d4d4d` inactive / `#000000` emphasized/active / `#ffffff` on dark backgrounds / `#146c44` on Add Tag / `#000000` on map & waveform action buttons).

---

## 10. Text Content Inventory

All literal text node contents encountered (for copy accuracy):

- "Bays Ranch", "Admin"
- "Dashboard" (nav item), "Activity Logs", "Map", "Audit Manager", "Reports", "Schedule", "Employees", "Performance", "Messages", "Settings", "Support", "Switch User", "Log Out"
- "OVERVIEW", "COMPLIANCE", "TEAM MANAGEMENT", "OTHER"
- "1" (sidebar badge)
- "Dashboard" (page title), "An overview of your farm and employee activity", "Search"
- "Todays Recordings", "5", "1 New"
- "Active Workers", "12"
- "Response Accuracy", "90"
- "New Employee Logs (4)"
- "Date", "Sort", "This Month (4)", "Filter"
- "EMPLOYEE", "ACTIVITY", "DATE", "FIELD", "TIME", "View All"
- Table rows: see §5 data table
- "View" (×10 rows), "Close" (row 1, expanded)
- "Play Recording", "Add Tag", "Summary", the full summary paragraph (see §6), "Expand Map"

---

## 11. Things Not Fully Determined

- Exact gradient angle math beyond the reported handle positions (sidebar border is a straight vertical top→bottom gradient at 15% opacity — confirmed via `gradientHandlePositions`).
- Whether "1 New" on the Todays Recordings card is meant to visually read as a badge/pill in the final UI — the Figma layer itself has **no** background fill, just plain black text next to the big number; treat it as plain text unless the developer wants to add emphasis.
- Checkbox "checked" visual state — only the unchecked `square` outline icon appears anywhere in either frame; no checked/indeterminate variant exists in this file.
- The waveform's exact bar-height data (97 individual bar heights) is derivable from `design/raw/nodes-full.json` (search for `"Group 1"` under node `I1:764;448:5888`) if pixel-exact reproduction of the waveform shape is desired; this spec summarizes the pattern (color split + heights range) rather than enumerating all 97 values.
