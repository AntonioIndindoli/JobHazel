**Landing-story design and content plan**

Reviewed October 8, 2026 against the current local frontend at desktop (1280 × 720), tablet (768 × 900), and mobile (390 × 844). This review covers the product story, closing CTA, and their connections to the hero and navigation. Findings are design judgments supported by the rendered page and source; conversion impact has not been measured.

The section has a useful foundation: real product screenshots, a restrained green palette, and concrete features. Its main weakness is the relationship between the message and the visual evidence. Some screenshots dominate the layout; others become too small to explain anything. The page needs a clearer journey and more deliberate emphasis.

**Issues, in priority order**

| Priority | Issue and evidence | Why it matters | Proposed fix |
| --- | --- | --- | --- |
| High | Screenshot scale varies dramatically. At desktop, the import image is about 734px tall and the interview image about 914px tall. At mobile, the full application interface is only about 303px wide. | Large form screenshots add scrolling, while compressed interfaces fail to demonstrate the benefit. | Give each visual one job. Use focused captures and mobile compositions with readable details, deliberate framing, and a short explanatory caption. |
| High | The import and insights cards are approximately 1160px and 970px tall at desktop. Their copy-to-image spacing and bottom edges differ. The interview image also creates substantial empty space around the vertically centered follow-through copy. | The layout feels uneven, and screenshot dimensions determine the page rhythm. | Replace the two tall feature columns with a sequence of composed sections. Align copy with the useful part of each visual and establish a consistent spacing system. |
| High | The content order is tracking → import → insights → resumes → follow-through. There is no visible introduction to the feature section; its first headings are h3s. | The reader must assemble the workflow and the main value proposition themselves. | Introduce the section with an h2 and organize the story around saving, organizing, following through, and learning. |
| High | Import promises faster extraction but shows the input form rather than the populated draft. Follow-through discusses tasks, contacts, and interviews but only shows interview details. Resume management has no dedicated visual proof. | Readers see controls without consistently seeing the result those controls deliver. | Show a reviewed import draft, an application with its linked resume, and an interview paired with a relevant preparation or follow-up task. |
| Medium | Important supporting text is small: desktop checklists are 12px; mobile checklists are 11px; follow-through descriptions are 12px. Forced line breaks also create awkward heading wrapping on narrower screens. | The information hierarchy makes the headings easy to scan but the useful explanation harder to read. | Use roughly 15–16px body and benefit text, responsive heading sizes, natural wrapping, and shorter explanations. |
| Medium | Every feature uses a similar two-part headline and a large rounded surface. Several paragraphs and bullets repeat connected records or comparing outcomes. | Features compete at similar visual weight, and the section becomes repetitive. | Give application tracking the strongest product visual. Use quieter treatments for supporting capabilities, and remove repeated explanations. |
| Medium | The Chrome extension occupies a substantial part of the import card even though the copy says its Web Store release is coming soon. | An unavailable distribution path competes with a feature visitors can use today. | Keep the web import flow primary. Reduce the extension to a compact, clearly labeled availability note. |
| Medium | The closing button says “Get Started,” while the hero says “Start for free.” The closing headline repeats a broad organization promise. The top navigation has no feature links. | The page provides little help for visitors who want to jump to details, and the final action has less context than it could. | Use a consistent “Start for free” label, connect the closing message to saving the first role, and add a small set of desktop anchor links. |
| Medium | The screenshot README confirms that the same light-theme images serve both themes. Example data is explained in the README rather than beside the story visuals. | The dark-page presentation can feel inconsistent, and sample analytics may look like evidence of product performance. | Review dark framing deliberately and label example data in the visible captions. Avoid implying that sample outcomes establish a performance claim. |

**Recommended content sequence**

Use four chapters. Keep the existing Northstar example role as the thread connecting import, application details, resume, and interview preparation. Each chapter should contain a benefit headline, one short explanation, at most two supporting points, and a visual that proves the specific benefit.

1. **Section introduction.** Suggested h2: “From saved job to next step.” Supporting sentence: “Save opportunities, keep their details together, and see what needs your attention.” A compact “Save → Organize → Follow through → Learn” line can orient the reader without adding another large block.
2. **Save.** Suggested headline: “Save a job without retyping every detail.” Explain that a link or pasted description creates an editable draft. Show the posting input leading to the populated draft, with the review step visible. Keep the extension availability note secondary. Do not imply that every job URL imports perfectly.
3. **Organize.** Suggested headline: “Every role, with its details in one place.” Make this the strongest visual chapter: a selected application showing its stage, linked resume version, notes, and next task. Fold resume management into this story as a concise supporting callout, retaining its existing anchor for navigation.
4. **Follow through.** Suggested headline: “Be ready for the next conversation.” Show interview time, meeting link, and prep notes alongside a relevant task. Explain linked people and optional task creation briefly. Make clear that automatic follow-up tasks are created inside JobHazel; do not suggest that messages are sent automatically.
5. **Learn.** Suggested headline: “See which sources lead to responses.” Show a focused source comparison and a useful outcome column. Add a concise resume-outcomes mention if needed. Explain that these are recorded results and that patterns emerge as history grows. Avoid causal claims about resume effectiveness.
6. **Close.** Suggested headline: “Give your next opportunity a home.” Button: “Start for free.” Place “Free to get started. No credit card required.” near the button. Preserve the existing signup action. Keep the footer compact.

The introduction and closing CTA frame the four chapters; they are not additional feature blocks. Aim for roughly 230–270 words of story copy, excluding text inside screenshots. Treat this as an editing target, with essential product qualifications retained.

**Visual direction**

- Keep the brand's green and warm neutral foundation. Use a strong mint surface for the application chapter, quieter surfaces for supporting sections, and the existing deep green for the closing CTA. Use color to establish emphasis rather than giving every feature equal prominence.
- Introduce more open space between chapters and reduce unnecessary nested boxes. Use a small spacing scale such as 8, 16, 24, 32, and 48px; use larger gaps intentionally between major sections. Keep radii and shadows consistent and subtle.
- Use a clear type hierarchy: section title, chapter headline, normal-sized explanation, and quieter caption. Keep essential benefit text readable at mobile sizes. Let headlines wrap naturally instead of placing unconditional `<br />` elements in each one.
- Frame screenshots around the meaningful product state. Preserve real controls and accurate product behavior. A consistent visual envelope helps alignment, but cropping must preserve the result being demonstrated; forcing every asset into one aspect ratio would lose useful information.
- Add external captions that explain the takeaway, for example “The resume and preparation task stay attached to the selected role.” Include a quiet “Example data” label. Visitors should understand the benefit without deciphering the entire screenshot.
- At tablet widths, stack any copy/visual arrangement that becomes cramped. Start by evaluating the existing 850px breakpoint; select the final breakpoint from actual content fit. Below it, use focused single-column visuals rather than shrinking desktop interfaces.
- Use separate mobile captures where a crop cannot retain both context and readable evidence. Keep explanatory labels as HTML text. If enlargement is still useful, provide a clearly labeled preview interaction with keyboard access; do not make enlargement necessary to understand the feature.
- Keep motion restrained and compatible with reduced-motion preferences. Review reveal timing after section heights change so important information does not appear as an empty block during normal scrolling.

**Implementation order**

1. **Restructure and edit the story.** Update `frontend/app/components/LandingProductStory.tsx` with the introduction, four chapters, shorter copy, and consistent closing CTA. Preserve meaningful existing anchors. Add limited feature navigation in `LandingPage.tsx`. Set a sensible h1 → h2 → h3 hierarchy. Review the copy against implemented capabilities before capturing new images.
2. **Create the visual evidence.** Extend `frontend/scripts/capture-landing.cjs` to capture import review, focused application/resume details, and interview/task proof with fictional data. Produce desktop and mobile variants where required. Update `frontend/public/landing/README.md` with the purpose and dimensions of each asset. Verify every capture visually.
3. **Build the layout and responsive treatments.** Refine `frontend/app/styles/06-landing-story.css` and extend `LandingScreenshot.tsx` to select the appropriate visual and render its caption. Fix the tablet layout, heading wrapping, text sizes, alignment, image framing, and theme treatments. Remove older preview styles only after checking for other consumers.
4. **Review the complete page.** Check the hero-to-story transition and the story-to-signup path. Capture desktop, tablet, and mobile views; correct visual defects before considering the redesign complete. Keep changes focused on the landing story and its direct navigation/CTA connections.

**Acceptance criteria**

- A reader scanning the headings understands the sequence: save a role, keep its records together, prepare and follow through, then review recorded outcomes.
- Each chapter has visible evidence of its main benefit. Import shows a draft result; organization shows a linked resume; follow-through shows a relevant task; analytics has a clear, readable comparison.
- At 320, 390, 768, 1024, and 1440px widths, text wraps cleanly, important screenshot details remain understandable, and there is no horizontal overflow or large accidental empty area. Supporting information no longer relies on 11–12px type.
- Adjacent elements align intentionally. Tall screenshots do not dictate excessive section heights. As an initial target, reduce the approximately 4810px mobile story height at 390px width by around 20%, while improving readability and preserving essential information.
- Light and dark presentations look deliberate, sample data is labeled, and reduced-motion presentation keeps all information available.
- Feature anchors, keyboard focus, any preview interaction, and the closing signup button work. The extension remains clearly marked as coming soon. Existing product limitations and free-start wording remain accurate.
- Use a short comprehension review with representative users to test whether they can explain what JobHazel does and name a reason to try it. If analytics instrumentation is available, compare story-to-signup clicks and completed signups after release; scroll depth alone does not establish effectiveness.

**Primary files**

`frontend/app/components/LandingProductStory.tsx`, `frontend/app/styles/06-landing-story.css`, `frontend/app/components/LandingScreenshot.tsx`, `frontend/app/components/LandingPage.tsx`, `frontend/scripts/capture-landing.cjs`, and `frontend/public/landing/`.

**Implementation record — October 8, 2026**

Implemented the four-chapter sequence, section introduction and navigation, combined application/resume story, focused responsive product visuals, visible example-data captions, theme-specific WebP captures, and consistent free-start CTAs. Removed the retired story preview styles. The screenshot generator now supports offline story captures and records intrinsic dimensions in a manifest.

Validation passed: focused ESLint checks, TypeScript, production static build, five viewport widths (320, 390, 768, 1024, and 1440px), light/dark capture switching, visible keyboard focus, image loading, chapter anchors, and the closing CTA opening signup. Reduced-motion styles preserve visible content. The mobile story measures approximately 4082px at 390px width, compared with 4810px in the audit (about 15% shorter), with 15px benefit text. Story copy is 262 words. Conversion measurement and representative-user comprehension review remain post-release evaluation steps.

**User-directed refinements — October 8, 2026**

The extension now has a prominent feature card describing capture, review, and saving in the Chrome side panel; this supersedes the original recommendation to reduce it to an availability note. The import headline is “From job posting to portfolio,” with copy explaining automatic field extraction from a posting link or Chrome capture and review before saving. Chapter and navigation numbering have been removed.

The story fixture now represents 72 submitted applications plus one saved opportunity. Indeed replaces referrals in the source comparison: 8 responses from 30 submissions, versus LinkedIn's 5 from 24 and company websites' 3 from 18. All rates are computed by the shipped analytics component from fictional records. The regenerated images and captions show these counts in light and dark themes.

Follow-up validation passed: ESLint, TypeScript, production build, desktop and narrow-mobile visual checks in both themes, responsive overflow checks at 320, 390, 768, 1024, and 1440px, loaded images, and working chapter anchors.

**Layout balance refinement — October 8, 2026**

Replaced the floating, centered introduction with a header aligned to the feature cards and compact navigation beside it. Reduced the introduction-to-feature gap from 72px to 28px and chapter gaps from 80px to 40px (28px on phones). The import copy, Chrome promotion, and preview now share a single warm frame with equal-width desktop columns and a wider 1280px container. On phones, the extension icon sits in the card header to give its description the full content width. Validation passed for ESLint, TypeScript, the production build, anchors, image loading, and responsive layouts from 320px through 1440px in light and dark themes.

**Linear flow and extraction evidence — October 8, 2026**

Replaced the two-column chapter navigation with one ordered, unnumbered row: Save → Organize → Follow through → Learn. Connectors remain visible on phones. The import visual now uses an HTML example of a job posting and matching extracted fields, with an explicit “Automatically extracted” heading, highlighted source values, field confirmations, and a review-before-save outcome. This supersedes the two-field import screenshot in the public story.

All four chapters now share the same bordered frame, padding, corner radius, spacing, and copy-left/visual-right desktop layout. Follow through and Learn use the same supporting-note treatment as Organize. Warm and mint surfaces alternate consistently. The existing Indeed comparison still represents 72 submitted applications. Responsive checks confirmed linear ordering and no page, demo, or field overflow at 320, 390, 768, 1024, and 1440px.

**Extraction illustration refinement — October 8, 2026**

Reframed the import visual as an explanatory document-to-data diagram. Removed the URL-input treatment, browser chrome, form-style field boxes, checkmarks, and button-shaped “Ready to review & save” outcome. A larger directional arrow and distinct matching highlights connect the posting's role, company, location, salary, and description to an annotated extracted-details list. Shared sample values keep both sides consistent. Light and dark palettes retain readable text, and the caption identifies this as an illustrated example while describing review before saving to the portfolio.

Validation passed: ESLint, TypeScript, production build, matching source/result values and highlight colors, and no page, diagram, or extracted-text overflow at 320, 390, 768, 1024, and 1440px in both themes. Desktop and phone views were reviewed visually. The illustration contains no interactive controls.

**Application-panel accuracy refinement — October 8, 2026**

Replaced the Organize section's reconstructed panel excerpt with a pixel crop of the intact `ApplicationsView`, rendered with the normal product styles at its real desktop and mobile breakpoints. The capture retains the header edit/menu controls, status selector, section separators and spacing, resume filename and PDF download where the product displays them, and task completion/menu controls. The crop ends after Actions and includes the desktop collapse control beside the divider. No application UI markup is rearranged and no capture-specific application styles are applied. All four application assets and their intrinsic dimensions are regenerated; `--story=applications` allows refreshing them independently.

Validation passed: capture-script syntax and execution, ESLint, TypeScript, production build, loaded application images and no page overflow at 320, 390, 768, 1024, and 1440px in both themes. The new desktop and mobile captures were inspected directly and in the landing page.

**Story hierarchy and narrative refinement — October 8, 2026**

Reworked the opening around the promise “More applications. Less to keep in your head.” The introduction now pairs a larger headline with concise context and a working portfolio signup action. Replaced four enclosing chapter cards with a consistent sequence of open rows, clear dividing rules, narrower copy columns, and larger framed visuals. The linear, unnumbered navigation remains. The Chrome extension promotion now uses a prominent dark-green treatment.

Chapter copy now connects the workflow to specific benefits: capturing posting details, recovering application context, preparing for conversations, and learning from recorded responses. The closing CTA starts with one saved role. The extraction illustration, actual application-panel capture, and 72-application analytics example remain in use. Layouts stack at 1000px to keep the wider visual treatment readable.

Validation passed: ESLint, TypeScript, production build, light/dark layouts without page or extraction-diagram overflow at 320, 390, 768, 900, 1024, and 1440px, and the new signup button opening the account dialog. Desktop and mobile layouts were reviewed visually.

**Simplification and workspace context — October 8, 2026**

Reduced each chapter to one headline and one short paragraph. Removed the introductory supporting pitch and extra signup action, secondary benefit blocks, repeated icons, and nested visual frames. The extension remains a dedicated callout explaining capture, review, and saving. Short captions retain example-data labeling, and the extraction diagram retains its matching highlights.

Application and interview screenshots now show the intact collection lists alongside their selected detail panels, using the real component markup and styles. Both chapters use full-width screenshots below concise headings and copy. Mobile views retain both panes and offer a full-resolution image link. The application fixture still contains 72 submitted roles plus one saved role. These workspace captures replace the earlier detail-only crops and the composed interview excerpt.

Validation passed: capture generation, ESLint, TypeScript, production build, loaded full-resolution previews and no page overflow at 320, 390, 768, 1024, and 1440px in light and dark modes. Full-size links match the active theme. Desktop captures and mobile presentation were reviewed visually.

**Editorial styling refinement — October 8, 2026**

Kept the approved full-workspace screenshots, extraction illustration, and concise copy. Added warm paper backgrounds, forest-green serif display headings, a compact linear navigation pill, fine eyebrow rules, and consistent sage image framing. Balanced workspace headings against their supporting text and tightened chapter spacing. The Chrome extension remains a clearly labeled callout with honest launch availability.

Validation passed: production build including TypeScript, diff whitespace check, and no page or extraction-diagram overflow at 320, 390, 768, 1024, and 1440px in both themes. Desktop, mobile, and dark workspace presentation were visually reviewed.
