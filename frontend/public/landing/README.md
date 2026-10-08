# Landing page product captures

The product story pairs an HTML posting-to-details illustration with
focused excerpts from the current product components, the Geist variable
font, and the stylesheet order in `app/globals.css`.
All data is fictional. Captures demonstrate recorded product states, not
conversion or performance claims.

The story example contains 72 submitted applications and one saved opportunity.
Source comparisons show Indeed (8 responses / 30 submitted), LinkedIn (5 / 24),
and Company Website (3 / 18). The product calculates these figures from the
fictional applications and recorded status changes; they are not hardcoded
into the table.

| Story assets | Focus |
| --- | --- |
| import*.webp | Retained review-step captures; the current story uses `LandingImportDemo.tsx` |
| applications.webp / applications-dark.webp | Application list alongside the selected role, resume, tasks, interviews, and notes |
| interviews.webp / interviews-dark.webp | Interview list alongside the selected interview, meeting details, and notes |
| analytics*.webp | Source names, response rates, and submitted-application denominators |

Application and interview workspaces render at 1280 × 850 CSS pixels in both
themes. Their mobile manifest entries reuse the desktop capture so both panes
remain visible; a full-size link lets visitors inspect the original image.
The other desktop captures render at 600 CSS pixels wide, with mobile variants
at 360. Exports use twice that resolution. `story-screenshots.json` records the
intrinsic dimensions and paths, so responsive pictures reserve the correct
space and use the variant appropriate to the selected page theme.

Application and interview captures render the intact `ApplicationsView` and
`InterviewsView` with shipped styles and no capture-specific UI overrides. They
include the collection tabs, search and sorting controls, list, and selected
detail panel in one viewport. These captures show the collection workspace;
the surrounding dashboard navigation is outside the capture.

The analytics and retained import excerpts omit unrelated fields and
controls and tighten spacing for the landing page. They use actual component
markup and sample data. Visible HTML captions explain each image and label it
“Example data.”

`LandingImportDemo.tsx` shows a fictional posting excerpt and its automatically
extracted role, company, location, salary, and description. Matching highlights
and accent lines map each source value to the extracted list. The source and
result share the same sample values, including the visible description excerpt.
The figure uses a document-to-data diagram with no browser chrome, form fields,
or button-shaped outcomes. It is labeled “Illustrated example,” stacks in narrow
containers, and does not run an import or save an application.

Regenerate the current story assets and their manifest from `frontend`:

```powershell
node scripts/capture-landing.cjs --story-only
```

Refresh the application or interview workspace captures independently:

```powershell
node scripts/capture-landing.cjs --story-only --story=applications
node scripts/capture-landing.cjs --story-only --story=interviews
```

This runs offline and needs no account, backend, or local preview server.
Playwright, Sharp, and Microsoft Edge must be available. Set
`LANDING_BROWSER_CHANNEL` to another installed Chromium channel if needed.

The hero uses `dashboard-preview-{960,1440}.{webp,avif}` and
`dashboard-preview-mobile-{480,720}.{webp,avif}`. It comes from the live
`/dashboard-preview` route so the chart can hydrate. To refresh both the story
and hero, start a local preview, then run the full capture:

```powershell
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3200
```

In another terminal:

```powershell
$env:LANDING_BASE_URL = 'http://127.0.0.1:3200'
node scripts/capture-landing.cjs
```

The hero remains 1440 × 778 on desktop and 720 × 1219 on mobile. If its mobile
widgets change height, update the source dimensions and the mobile aspect
ratio in `05-landing.css` to match. Legacy feature PNGs are retained; the story
uses the new WebP variants. Refresh the landing page after capture.

The hero also includes matching `dashboard-preview-dark-*` desktop and mobile
AVIF/WebP assets. The page selects the picture using its `data-theme` value,
including the manual theme toggle. To refresh only the dark hero:

```powershell
$env:LANDING_BASE_URL = 'http://localhost:3000'
node scripts/capture-landing.cjs --hero-only --dark-only
```

Omit `--dark-only` to capture both themes. `--hero-only` preserves story assets.

The separate resume analytics chapter uses `resumeAnalytics*.webp`, captured
from the actual `ResumePerformanceTable` in light/dark desktop and mobile
layouts. Its fictional three-version example totals 72 submitted applications
and 16 responses. All five table columns are retained; mobile uses the product's
responsive cards. Refresh it with:

```powershell
node scripts/capture-landing.cjs --story-only --story=resumeAnalytics
```
