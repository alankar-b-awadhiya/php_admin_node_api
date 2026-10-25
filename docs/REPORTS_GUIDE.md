# Reports — Complete Guide (Hinglish)

Ye guide ABA Master Console ke **Reports** module ke liye hai: API se data lena, chart banana, aur dashboard par dikhana.
Isme setup, roz ka use, ek poora example, permissions, troubleshooting aur file map sab hai.

> Tech words (source, widget, filter, binding) English mein hi rakhe hain, kyunki screen par wahi dikhte hain.

---

## 1. Ye module kya karta hai

Teen layers hain. Har layer pichli layer par banti hai:

```
API Source  ──►  Widget  ──►  Dashboard
(data kahan se)  (kaunsa chart)  (kaun se widgets, kaun se filters)
```

| Layer | Matlab | Example |
|---|---|---|
| **API Source** | Ek API jo rows return karti hai. Ek baar register karo. | `Sales API` → `https://…/sales?region={region}` |
| **Widget** | Source ke fields ko chart se jodna: kaunsa field label, kaunsa value, kaunsi aggregation. | "Revenue by month" (bar chart) |
| **Dashboard** | Kai widgets ek grid par, upar filters. | "Sales overview" |

**Ek dashboard = ek API call.** Viewer `GET /report-dashboards/:code/data` se saare widgets ek saath laata hai.
Ek widget fail ho jaye to sirf wahi frame error dikhata hai, baaki chalte rehte hain.

Sidebar mein **Reports** group hai: **Dashboards**, **Widgets**, **API Sources**.

---

## 2. Setup aur deployment checklist

### 2.1 Backend (Node API)

1. DB: `database/schemas/aba_reports_db.sql` chalao, phir `database/reports_rbac_seed.sql`.
   Isse teen RBAC resources ban jaate hain: `report-sources`, `report-widgets`, `report-dashboards`.
2. `.env` mein ye chahiye: `DB_REPORTS_*`, `MS_REPORTS_PORT`, `REPORTS_ENC_KEY`
   (32 bytes base64: `openssl rand -base64 32`). Optional: `REPORTS_INTERNAL_BASE_URL`, `REPORTS_ALLOWED_HOSTS`.
3. `ms_reports` service chalao (`npm run dev:reports`). Gateway par `/api/v1/report-*` ka route ho.
4. **`GET /auth/my-permissions`** (step 7 ka chhota patch): `apis_step7_my_permissions.zip` ke 3 files `ms_master` mein daalo
   (`masterAuth.controller.js`, `masterAuth.routes.js`, `masterAuth.service.js`) aur restart karo.
   Iske bina UI buttons chhupana kaam nahi karta (buttons dikhte rehte hain, par API 403 deti hai).
5. CORS: `CORS_ORIGINS` mein admin panel ka exact origin hona chahiye (cookies ke liye).

### 2.2 UI (PHP admin panel)

1. UI zips ke files apne repo mein merge karo (path same rakho: `public/…`, `app/config/config.php`).
2. `app/config/config.php` mein `ASSET_VERSION` badhao (abhi `1.17.0`), warna browser purani JS/CSS cache se dikhayega.
3. `.env` (UI) mein `ABA_API_BASE_URL` API ka URL ho, `/api/v1` ke saath.
4. Chart.js local file `public/assets/vendor/chart.umd.js` se aata hai. CDN ki zaroorat nahi.

### 2.3 Role ko access dena

**Role Matrix** page (`rbac-permissions.php`) par role ko ye grants do:

| Kaam | Resource | Permission |
|---|---|---|
| Dashboard dekhna | `report-dashboards` | `view` |
| Widgets list dekhna / widget ka data | `report-widgets` | `view` |
| Sources dekhna | `report-sources` | `view` |
| Naya banana | `<resource>` | `create` |
| Edit, on/off, Test API, layout save | `<resource>` | `edit` |
| Delete | `<resource>` | `delete` |

`SUPERADMIN` ko grants ki zaroorat nahi hai (API usko bypass karti hai).

**Dhyan rakho:** dashboard sirf `report-dashboards:view` se khulta hai, par uska data har widget ke apne permission se aata hai.
Agar viewer ke paas kisi widget ka (ya uske "Extra permission resource" ka) `view` nahi hai, to us frame mein
"aapko is data ka access nahi" dikhta hai, aur baaki dashboard chalta hai.

---

## 3. Step 1 — API Source banana

**Reports → API Sources → New API Source.**

### 3.1 Form ke fields

| Field | Kya daalna hai |
|---|---|
| **Source name / code** | Naam aur unique code (`sales_api`). Code small letters, digits, `_`; letter se shuru. Delete ke baad bhi code reserved rehta hai. |
| **Internal API** checkbox | ON = isi platform ki apni API (path jaise `/api/v1/clientele`), logged-in user ka token forward hota hai. OFF = bahar ki API (poora `https://` URL). |
| **Method** | `GET` ya `POST`. |
| **API URL** | URL ya path. `{param}` placeholders allowed hain. |
| **Response path** | Dot path jahan rows hain, jaise `data.clientele`. Blank = response khud rows ki list hai. |
| **Auth type** | `No authentication`, `Bearer token`, `API key (header / query)`, `Basic (username + password)`, `Logged-in user's token (internal APIs)`. Auth type ke hisaab se credential fields badalte hain. |
| **Query parameters (JSON)** | `{"region": "{region}", "from": "{month_start}"}` |
| **Extra headers (JSON)** | `{"X-Client": "aba"}` |
| **Request body (JSON, POST only)** | POST ke liye body. |
| **Loading / Error message** | Chart ke andar dikhne wale messages. |
| **Cache responses / Cache time (seconds)** | Cache ON rakhoge to har baar upstream API call nahi hogi. |
| **Timeout (ms), Max response size (KB)** | Safety limits. |

**Credentials:** save ke baad kabhi wapas nahi dikhte, sirf "Credential saved" dikhta hai. Edit karte waqt secret field khaali chhodo to purana credential bana rehta hai; naya type karo to badal jaata hai.

### 3.2 Placeholders

URL, query, headers, body mein `{naam}` likho. Do tarah ke hote hain:

- **Params** (aap define karte ho, Step 3.4): `{region}`, `{status}` …
- **Built-in tokens:** `{today}`, `{yesterday}`, `{month_start}`, `{month_end}`, `{year_start}`, `{year_end}`, `{year}`, `{month}`, `{user_id}`.

Example: `https://api.example.com/sales?from={month_start}&to={today}&region={region}`

### 3.3 Test API aur fields detect karna

Form ke andar **Test API** dabao. Result mein rows ka preview aur auto-detected fields dikhte hain.
Agar URL mein `{params}` hain to "Test values (JSON)" mein values do, jaise `{ "region": "north" }`.

Save karne ke baad "After saving, call the API once to detect its fields" ka option field catalogue bhar deta hai.
Bina field catalogue ke widget builder mein fields nahi milenge.

### 3.4 Source detail: Fields, Params, Cache and runs

List mein source ke naam par ya "Details" icon par click karo. Teen tabs hain:

| Tab | Kya hota hai |
|---|---|
| **Fields** | Auto-detected fields ka table. Har field ka **label**, **type** (`string`, `number`, `date`, `datetime`, `currency`, `percent`, `boolean`) aur **role** (`dimension`, `measure`, `time`) badal sakte ho. "Detect fields from API" se dobara detect hota hai. |
| **Params** | `{placeholder}` ke liye key, label, type (Text/Number/Date/Date range/Select), required, default, options. "Add from placeholders" URL se missing params khud jod deta hai. |
| **Cache & runs** | "Clear cache" aur recent run log (kab chala, kitna time, error). |

**Select param ke options:** ek line mein ek, ya `value|Label`.

### 3.5 Source ko on/off karna

List mein pause/play icon. Off source "Inactive" badge ke saath dikhta hai. (Off source ke widgets ka runtime behavior maine API code mein verify nahi kiya, to switch off karne ke baad ek widget preview karke dekh lena.)

### 3.6 Safety (kyu koi URL reject ho sakta hai)

Private/loopback IP block hai, sirf ports 80/443/8080/8443, redirects nahi, response size aur timeout limit hai.
Optional host allowlist `REPORTS_ALLOWED_HOSTS` se lagta hai. Reports API ko reports API se call karna block hai.

---

## 4. Step 2 — Widget banana

**Reports → Widgets → New Widget.** Ek builder khulta hai: left mein form, right mein **live preview**
(`POST /report-widgets/preview`), yaani save karne se pehle chart dikhta hai.

### 4.1 Basics

1. **Source** chuno. Uske fields aur params load ho jaate hain.
2. **Title**, **Subtitle**, **Code**.
3. **Chart type** chuno (neeche table).
4. Jis source ke params required hain, preview ke liye unki test values bharo.

### 4.2 Chart types aur field mapping

Chart type badalne par mapping slots badalte hain.

| Chart | Slots | Kab use karo |
|---|---|---|
| **Line / Area** | X axis, Value (aur optional "Split by"/series) | Trend, time series |
| **Bar** | X axis, Value (series, bar+line mix ho sakta hai) | Categories ki tulna |
| **Stacked bar** | X axis, Value, Split by | Total ke parts |
| **Pie / Donut** | Label, Value | Share of whole |
| **KPI** | Sirf Value | Ek bada number |
| **Table** | Columns (fields), Sort rows by (optional, max 3) | Rows aur columns |
| Gauge, Scatter | — | "Coming soon", disabled (backend abhi reject karta hai) |

Har slot ke saath:

- **Aggregation:** `none`, `sum`, `avg`, `min`, `max`, `count`, `count_distinct`.
  `sum/avg/min/max` sirf number fields par chalte hain; text field par `count` ya `count distinct` use karo.
- **Sort** (ascending/descending) aur sort-by field.
- Series ke liye "More options" (cog icon): **Draw as** (bar/line/area), **Y axis** (left/right), color, label.

### 4.3 Display and limits (advanced section)

| Option | Matlab |
|---|---|
| **Row limit** | Max categories/slices/rows (1–10000). |
| **Auto-refresh (seconds)** | Dashboard is widget ko is interval par dobara laata hai (5–86400). |
| **Legend** | Automatic / Top / Bottom / Right / Hidden. |
| **Smooth curves**, **Horizontal bars** | Line/area/bar ke liye. |
| **Category axis title / Value axis title** | Cartesian charts par axis ke naam. |
| **Value axis minimum / maximum** | Axis ki seema. Minimum set karoge to axis zero se force nahi shuru hoga. Minimum maximum se chhota hona chahiye. |
| **Show values on the chart** | Bars, points aur slices par numbers (60 se zyada points par band). |
| **Fixed height (px)** | 120–1200. Blank = chart apne grid cell ko bhar deta hai. |
| **Slice colors** (pie/donut) | Har line: `Label\|#hex` us slice ko color deta hai, sirf `#hex` slices ko order mein. Baaki theme colors. |
| **Extra permission resource** | Optional: viewer ko is RBAC resource par bhi `view` chahiye. |
| **Widget is active** | Off widget dashboard mein nahi laya ja sakta. |

Chart ke colors **theme panel** ke CSS variables se aate hain, aur theme badalne par chart khud redraw hota hai.

### 4.4 Widget list ke actions

Preview (live data), Edit, on/off, Delete. Jo widget kisi dashboard mein laga hai uska "dashboardCount" list mein dikhta hai.

---

## 5. Step 3 — Dashboard banana

**Reports → Dashboards → New Dashboard.**

### 5.1 Basics

| Field | Matlab |
|---|---|
| Title, Code | Code link ka hissa hai (`?_d=sales_overview`). Baad mein badalne se saved links toot jaate hain. |
| Description | Optional. |
| **Grid columns** | 1–24 (default 12). Widget ki width in columns mein hoti hai. |
| **Auto-refresh (seconds)** | 5–86400, blank = off. Blank ho to widgets ke intervals mein se sabse chhota use hota hai. |
| **Extra permission resource** | Viewer ko is resource par bhi `view` chahiye. |
| Active | Off dashboard khulta nahi (409). |

Naya dashboard khaali hota hai. Widgets aur filters **Layout builder** se judte hain.

### 5.2 Layout builder kholna

- List mein **Layout** icon, ya viewer mein **Edit layout** button.
- URL: `report-dashboards.php?_d=<code>&edit=1`
- Sirf `report-dashboards:edit` wale users ko ye khulta hai; baaki ko "no permission" dikhta hai.

### 5.3 Builder ke sections

**Grid:** columns badlo. "Layout map" ek chhota schematic hai: numbers widgets ka order dikhate hain.

**Filters:**

| Field | Matlab |
|---|---|
| Key | Lowercase, digits, `_`, letter se shuru. Binding mein `@key` isi se jaata hai. |
| Label | Filter bar mein naam. |
| Type | Select, Text, Number, Date, Date range. |
| Default value | `{today}`, `{month_start},{today}` (date range) jaise tokens allowed. |
| Depends on (parent filter) | Cascading: parent badalne par child clear hota hai aur options dobara aate hain. |
| Options come from | *A fixed list* (`value\|Label`, ek per line) ya *An API source*. |
| API source + Value field + Label field | Options kisi source se aate hain; fields source ke field catalogue se chunte ho. Parent ki value source ko us parent ke key naam ke param ke roop mein jaati hai. |
| Required | Khaali ho to dashboard load nahi hota ("Pick the filters"). |

**Widgets:**

1. Upar dropdown se widget chuno → **Add to dashboard** (ek widget kai baar laga sakte ho, alag bindings ke saath).
2. Har placement par: **Title on this dashboard** (override), **Width** (columns), **Height** (rows).
3. **Order** badalne ke 2 tareeke: **⋮⋮ handle ko drag karo**, ya ↑ / ↓ buttons.
4. **Param bindings** (collapsible): source ke har param ke liye
   - *Not set / param default* — source ka apna default use hoga,
   - *From a filter* — filter ki value (`@key` ke roop mein save hoti hai),
   - *Fixed value* — ek constant (`@` se shuru nahi ho sakta).

   Agar param required hai aur default nahi hai to warning dikhti hai: "bind it to a filter or a fixed value".

**Position kaise nikalti hai:** drag-drop se free placement nahi hai. Widgets order mein **left se right** bharte hain; jab agla widget bacha hua space mein nahi
fit hota to nayi row shuru hoti hai. Row utni unchi hoti hai jitna uska sabse unchha widget. Isliye "x + width > columns" ki galti ho hi nahi sakti.
Pehle haath se rakha layout agar kahin aur se aaya ho to wo (y, x) order mein padha jaata hai aur agle save par isi tarah dobara jam jaata hai.

**Save:** "Save layout" ya "Save & view". Save **ek hi PATCH** hai jo grid columns, filters aur widgets ek transaction mein likhta hai.
Is wajah se aadha-save nahi hota. Unsaved changes par "Unsaved changes" dikhta hai aur page chhodte waqt browser warn karta hai.

**Preview:** builder ke neeche "Preview" panel asli viewer ko embed karta hai. Ye **saved** version dikhata hai
(unsaved changes nahi), aur save ke baad reload hota hai. "Reload preview" se haath se bhi refresh kar sakte ho.

### 5.4 Dashboard list ke actions

Open, Layout, Edit details, on/off, Delete (code reserved rehta hai, widgets delete nahi hote).

---

## 6. Dashboard use karna (viewer)

Link: `report-dashboards.php?_d=<code>`

- **Filter bar** upar hai. Filter badalne par 350 ms baad data dobara aata hai.
- **Link share karna:** filter values URL mein sync hoti hain, to URL copy karke bhejo, dusre ko wahi selection dikhegi.
- **Cascading:** parent khaali ho to child "Select Region first" dikhata hai.
- **Reset:** sab filters clear (defaults dobara lagte hain).
- **Refresh data:** `?refresh=1` ke saath cache bypass karta hai. Auto-refresh cache bypass nahi karta aur tab hidden hone par ruk jaata hai.
- **Retry:** fail hue widget ke frame par Retry; ye poora dashboard dobara laata hai par sirf failed frames dobara banta hai.
- **Header mein "N widgets could not load":** forbidden widgets bhi is count mein aate hain.
- **Pin to home:** is dashboard ko home page par dikhata hai (neeche).

### 6.1 Pinned dashboard (home page)

- Viewer mein **Pin to home** dabao, ya `dashboard.php` par chooser se dashboard chuno.
- Home par ek card dikhta hai jisme wo dashboard chal raha hota hai, aur **Open / Change / Unpin** buttons hote hain.
- Pin **sirf us browser mein** yaad rehta hai (localStorage). Dusre browser/device par alag se pin karna padega.
- Agar dashboard mein required filter ka default nahi hai to card bolta hai "needs a filter value", aur Open se poora dashboard khulta hai.
- Jis user ke paas dashboards ka `view` nahi, use card dikhta hi nahi.

---

## 7. Poora example: "Sales overview" (shuru se aakhir tak)

Maan lo `https://api.example.com/sales?region={region}&from={month_start}&to={today}` aisi rows deta hai:
`{ "region": "north", "month": "2026-09", "revenue": 120000 }`, response `data.rows` ke andar.

**1. Source** (API Sources → New)
- Name `Sales API`, code `sales_api`, External, GET, URL upar wala, Response path `data.rows`, Auth `Bearer token`.
- Params tab mein `region` (Select, options `north`, `south|South Zone`, required).
- Test values `{ "region": "north" }` → Test API → fields detect (`region`, `month`, `revenue`).
- Fields tab mein `revenue` ko `measure`/`currency`, `month` ko `dimension` rakho.

**2. Widget 1: "Revenue by month"** (Widgets → New)
- Source `Sales API`, chart **Bar**.
- X axis = `month`, Value = `revenue` (Sum), Sort by `month` ascending.
- Display & limits: Value axis title `Revenue (INR)`, "Show values on the chart" ON.
- Preview dekho, Save.

**3. Widget 2: "Revenue by region"**
- Chart **Donut**, Label = `region`, Value = `revenue` (Sum).
- Slice colors: `north|#1a9c6b`.

**4. Dashboard**
- Dashboards → New: `Sales overview`, code `sales_overview`, 12 columns → Create.
- Layout icon → builder:
  - **Filters → Add filter:** key `region`, label `Region`, type Select, fixed list `north` / `south|South Zone`, Required ON.
  - **Widgets:** "Revenue by month" (width 8, height 4) aur "Revenue by region" (width 4, height 4) add karo.
  - Dono ke **Param bindings** mein `region` → *From a filter* → `Region`.
- **Save & view.** Filter bar mein region chuno, charts aa jaate hain. URL mein `&region=north` hota hai.
- **Pin to home** dabao, ab `dashboard.php` par ye dashboard dikhta hai.

---

## 8. Permissions UI mein kaise kaam karti hain

- API har route par permission check karti hai (`requirePermission`). **Asli enforcement wahi hai.**
- UI sirf wo buttons chhupata hai jo user use nahi kar sakta, ye `html` par `rpt-no-create/edit/delete` classes se hota hai.

| Hidden kaun sa button | Kis permission ke bina |
|---|---|
| New … | `create` |
| Edit, Layout, on/off (pause/play), Test, Save fields/params, Clear cache, Detect fields, Edit layout (viewer) | `edit` |
| Delete | `delete` |

- Source detail ke **Fields/Params inputs view-only user ke liye disabled** hote hain (padh sakte ho, type nahi).
- `SUPERADMIN` ko sab dikhta hai.
- Baaki users ke grants `GET /auth/my-permissions` se aate hain. Ye endpoint missing ho ya fail ho to UI **fail-open** hai (buttons dikhte hain) aur API 403 deti hai.
- Console mein ek `console.info` message aata hai agar ye endpoint na mile.

---

## 9. Troubleshooting

| Dikhta kya hai | Wajah | Kya karo |
|---|---|---|
| Widget frame mein "You do not have access to this data" | Is widget ka ya uske extra resource ka `view` nahi, ya internal source par user ki apni permission nahi | Role Matrix mein grant do |
| "Pick the filters to load this dashboard" | Required filter khaali hai aur default nahi | Filter chuno, ya builder mein default do |
| Dashboard 409 "switched off" | Dashboard inactive | List mein switch on karo |
| Dashboard 404 | Code galat ya delete ho gaya | List se dobara kholo |
| Builder mein "Could not load the source params" | Source par `report-sources:view` nahi, ya API down | Grant do / reload |
| Builder save: "…field is not in the source's field catalogue" | Options source ka field catalogue khaali | Source par Test API chalao (fields detect) |
| Builder save: "widget … does not exist" / "switched off" | Placed widget off ya delete | Widget on karo ya placement hatao |
| Builder save: "bound to removed filter" | Binding ek aise filter par hai jo hata diya | Binding badlo / filter wapas lao |
| Builder save: "no longer fit a N-column grid" | Columns kam kiye par widths badi hain | Widths chhoti karo, phir save |
| Select filter ke options "Could not load options" | Options source error | "Refresh data" dabao, source test karo |
| Select filter "Select X first" | Parent filter khaali | Pehle parent chuno |
| Source test: URL reject | SSRF guard (private IP, galat port, redirect) | Public https URL, port 443, ya `REPORTS_ALLOWED_HOSTS` |
| Chart purana dikhta hai | Cache ON hai | "Refresh data" ya source detail mein "Clear cache" |
| Naye UI changes nahi dikhte | Browser cache | `ASSET_VERSION` badhao, hard refresh |
| Buttons view-only user ko bhi dikhte hain | `my-permissions` endpoint deploy nahi hua | Backend patch deploy karo |
| Home par pinned card nahi | `report-dashboards:view` nahi, ya kuch pin nahi | Grant do / pin karo |
| "Could not reach the API" | `ABA_API_BASE_URL` galat ya CORS | UI `.env` aur API `CORS_ORIGINS` dekho |

---

## 10. Architecture aur file map

### 10.1 UI files

| File | Kaam |
|---|---|
| `public/report-sources.php`, `js/report-sources.js` | Sources list, form, Test API, detail (fields/params/cache/runs) |
| `public/report-widgets.php`, `js/report-widgets.js` | Widgets list aur builder (mapping, preview, options) |
| `public/report-dashboards.php`, `js/report-dashboards.js` | Dashboards list, basics modal, viewer, pin button |
| `js/report-dashboard-builder.js` | Layout builder (filters, widgets, bindings, drag, preview) |
| `js/reports-common.js` | API paths (`Reports.API`), helpers, params editor, **access (RBAC)**, **pinned** |
| `js/reports-render.js` | Shared `ReportsRender.renderWidget(el, payload, opts)` |
| `js/dashboard-pinned.js` + `dashboard.php/.js` | Home page ka pinned card |
| `vendor/chart.umd.js` | Chart.js (local) |
| `css/style.css` | `.rpt-*` rules (file ke end mein) |
| `includes/sidebar.php` | Reports group |

**Rendering rule:** widget builder, viewer, builder preview aur home card sab ek hi `renderWidget` use karte hain.
Isme loading, error, empty aur forbidden states handle hain, aur theme change par redraw hota hai.

### 10.2 API endpoints (gateway: `/api/v1/…`)

| Resource | Endpoints |
|---|---|
| `report-sources` | `POST /test`, CRUD, `PATCH /:id/status`, `GET\|PUT /:id/params`, `GET\|PUT /:id/fields`, `POST /:id/test`, `GET /:id/runs`, `DELETE /:id/cache` |
| `report-widgets` | `GET /meta`, `POST /preview`, CRUD, `PATCH /:id/status`, `PUT /:id/fields`, `GET /:ref/data` |
| `report-dashboards` | CRUD, `PATCH /:id/status`, `PUT /:id/filters`, `PUT /:id/layout`, `GET /:ref/data`, `GET /:ref/filters/:key/options` |
| `auth` | `GET /auth/my-permissions` (naya, step 7 patch) |

`:ref` numeric id ya code dono ho sakta hai. `PATCH /report-dashboards/:id` mein `filters[]` aur `widgets[]` bhi bheje ja sakte hain; builder yahi karta hai.

### 10.3 Widget `options` (JSON, widget ke saath store hota hai)

```json
{
  "legend": "bottom",
  "smooth": true,
  "horizontal": false,
  "xTitle": "Month",
  "yTitle": "Revenue (INR)",
  "yMin": 0,
  "yMax": 500000,
  "dataLabels": true,
  "height": 320,
  "sliceColors": { "North": "#1a9c6b" },
  "palette": ["#e5484d", "#7c3aed"]
}
```

Sab optional hain. Chart type par lagu na hone wale options save ke waqt hata diye jaate hain.

---

## 11. Testing: kya check ho chuka hai

Mock API ke saath real Chromium mein: **48 (builder) + 66 (RBAC, chart options, pinned, preview, mobile) + 16 (drag reorder, read-only)** checks pass hue, console JS errors zero.
Mock mein `apis` ki asli `dashboards.validation.js` lagi thi, to builder ka payload asli rules se check hua.

**Aapko apne real stack par karna hai** (ye mock se nahi ho sakta):

- [ ] Source → widget → dashboard ka poora run.
- [ ] Grid mein chart ka size (`grid_h` aur fixed `height` ka mel).
- [ ] Cascading filter (options source ke saath) aur param binding.
- [ ] View-only user se login karke buttons ka chhupna (`my-permissions` deploy ke baad).
- [ ] Mobile width aur dark theme par ek nazar.
- [ ] `GET /auth/my-permissions` DB ke saath (ye sirf syntax check hua hai).

---

## 12. Abhi kya nahi hai (known limits)

| Cheez | Wajah / kya chahiye |
|---|---|
| **Gauge, Scatter charts** | Backend schema mein hain par reject karta hai. Backend transform likhna hoga, phir UI mein enable karna. |
| **Server-side pin (sabke liye / user-wise)** | Abhi pin localStorage mein hai. Server par chahiye to ek chhota table + 2 endpoints chahiye. |
| **Builder preview mein unsaved changes** | Preview saved version dikhata hai. Draft preview ke liye backend mein draft-data endpoint chahiye. |
| **Free-form drag-drop grid** | Sirf order drag hota hai; positions auto-flow se nikalti hain. Ye jaan-boojh kar rakha gaya (kam risky). |
| **Deleted source/dashboard ka code** | Reserved rehta hai, dobara use nahi hota. |
| **Internal callbacks** | Gateway rate limit mein gine jaate hain. |

---

## 13. Delivery history (kaun si zip mein kya tha)

| Zip | Kya tha |
|---|---|
| Steps 1–5 | Foundation, API Sources, source detail, Widget builder, shared renderer |
| `ui_step6ab_updated.zip` | Dashboards list + viewer |
| `ui_step6c_updated.zip` | Layout builder |
| `ui_step7_final.zip` | RBAC hide, chart options, pinned card, embedded preview, README |
| `apis_step7_my_permissions.zip` | `GET /auth/my-permissions` (ms_master) |
| Is round ki zip | Drag-to-reorder, read-only editors, ye guide |
