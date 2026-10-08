// Capture current product components with fictional data; no account or API is used.
// --story-only runs offline. Full capture also needs the local frontend preview.
// --story=applications --story-only refreshes only the application-panel assets.
// LANDING_BASE_URL defaults to http://127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/landing');
const baseUrl = process.env.LANDING_BASE_URL || 'http://127.0.0.1:3000';

for (const extension of ['.ts', '.tsx']) {
    require.extensions[extension] = (module, filename) => {
        const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
            fileName: filename,
        });
        module._compile(outputText, filename);
    };
}
const component = (file, name) => require(path.join(root, 'app/components', file))[name];
const h = React.createElement;
const noop = () => {};
// Stable fictional dates keep regenerated examples reproducible.
const now = new Date('2026-10-08T17:00:00Z');
const date = (days, hour = 10) => {
    const value = new Date(now);
    value.setUTCDate(value.getUTCDate() + days);
    value.setUTCHours(hour + 7, 0, 0, 0); // Fictional October dates in Los Angeles.
    return value.toISOString();
};
const resume = {
    id: 'sample-resume', name: 'Product design · 2026', targetRole: 'Product Designer',
    originalFilename: 'Alex-Morgan-Product-Design.pdf', uploadStatus: 'READY', archivedAt: null,
};
const definitions = [
    ['Northstar', 'Product Designer', 'INTERVIEWING', 'LinkedIn', -2],
    ['Luma', 'Senior Product Designer', 'OFFER', 'Indeed', -7],
    ['Evergreen', 'UX Designer', 'APPLIED', 'Company Website', -3],
    ['Juniper Labs', 'Design Engineer', 'SAVED', 'LinkedIn', -1],
    ['Fieldwork', 'Product Designer', 'INTERVIEWING', 'Indeed', -12],
    ['Forma', 'Senior Product Designer', 'APPLIED', 'Company Website', -16],
    ['Meridian', 'UX Designer', 'APPLIED', 'LinkedIn', -20],
    ['Orbit', 'Design Systems Lead', 'REJECTED', 'Company Website', -24],
];
// A mature search: 72 submitted applications plus one saved opportunity.
// Add real fixture records so the product computes every displayed rate.
const sampleCompanies = ['Cedar', 'Aster', 'Finch', 'Mosaic', 'Arc', 'Willow', 'Harbor', 'Bloom'];
for (const [source, addedSubmissions, addedResponses] of [
    ['Indeed', 28, 6],
    ['LinkedIn', 22, 4],
    ['Company Website', 15, 2],
]) {
    for (let i = 0; i < addedSubmissions; i++) {
        definitions.push([
            `${sampleCompanies[i % sampleCompanies.length]} ${source === 'Indeed' ? 'Studio' : source === 'LinkedIn' ? 'Labs' : 'Digital'} ${Math.floor(i / sampleCompanies.length) + 1}`,
            i % 2 === 0 ? 'Product Designer' : 'Senior UX Designer',
            i < addedResponses ? 'REJECTED' : 'APPLIED',
            source,
            -(5 + i),
        ]);
    }
}
const applications = definitions.map(([companyName, title, status, source, days], i) => ({
    id: 'sample-' + i, companyName, title, status, source,
    createdAt: date(days), dateApplied: status === 'SAVED' ? null : date(days).slice(0, 10),
    sourceUrl: 'https://example.com/careers/product-designer', location: 'Remote',
    salaryMin: 120000, salaryMax: 160000,
    description: 'Design thoughtful tools that help people do their best work.',
    notes: 'Lead with the onboarding case study. Share the research, tradeoffs, and impact of the redesign.',
    resumeVersionId: resume.id, resumeVersion: resume,
}));
const interviews = [0, 4, 1].map((appIndex, i) => ({
    id: 'interview-' + i, applicationId: applications[appIndex].id,
    applicationTitle: applications[appIndex].title, companyName: applications[appIndex].companyName,
    type: ['TECHNICAL', 'MANAGER', 'RECRUITER_SCREEN'][i], outcome: i === 2 ? 'PASSED' : 'SCHEDULED',
    scheduledAt: date(i === 2 ? -4 : i + 2, i === 1 ? 14 : 10), durationMinutes: 45,
    location: 'Video call', meetingUrl: 'https://example.com/meet/design-team',
    interviewerName: ['Maya Chen', 'Sam Rivera', 'Jordan Lee'][i],
    notes: 'Walk through the onboarding redesign.',
    createdAt: date(-5), updatedAt: date(-1),
}));
const tasks = [
    { id: 'prep', applicationId: 'sample-0', title: 'Prepare portfolio walkthrough', type: 'PREP', dueDate: date(1) },
    { id: 'follow-up', applicationId: 'sample-2', title: 'Follow up with recruiter', type: 'FOLLOW_UP', dueDate: date(0) },
].map(task => ({ ...task, description: null, completedAt: null,
    applicationTitle: applications.find(app => app.id === task.applicationId).title,
    companyName: applications.find(app => app.id === task.applicationId).companyName,
    createdAt: date(-2), updatedAt: date(-2),
}));
const historyByApp = Object.fromEntries(applications.map((app, i) => [app.id,
    ['INTERVIEWING', 'OFFER', 'REJECTED'].includes(app.status) ? [{
        id: 'event-' + i, applicationId: app.id, type: 'STATUS_CHANGED', message: 'Status updated',
        metadata: { from: 'APPLIED', to: app.status }, createdAt: date(definitions[i][4] + 2),
    }] : [],
]));
const ApplicationsView = component('ApplicationsView.tsx', 'ApplicationsView');
const InterviewsView = component('InterviewsView.tsx', 'InterviewsView');
const ImportDrawer = component('ImportDrawer.tsx', 'ImportDrawer');
const SourceQualityTable = component('dashboard/SourceQualityTable.tsx', 'SourceQualityTable');
// Follow the app's import order, including only styles that actually ship on the page.
const css = [...fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').matchAll(/@import "\.\/([^"]+)";/g)]
    .map(([, file]) => fs.readFileSync(path.join(root, 'app', file), 'utf8')).join('\n');
const preflight = fs.readFileSync(path.join(root, 'node_modules/tailwindcss/preflight.css'), 'utf8');
const font = fs.readFileSync(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2')).toString('base64');
const fontCss = '@font-face{font-family:Geist;font-weight:100 900;src:url(data:font/woff2;base64,' + font + ') format("woff2")} :root{--font-geist-sans:Geist}';
const views = {
    applications: {
        view: h(ApplicationsView, { applications, interviews, tasks, resumes: [], focusedApplicationId: 'sample-0',
                onCreateApplication: noop, onCreateInterview: noop, onCreateTask: noop, onCompleteTask: noop,
                onDownloadResume: noop, onChangeResume: noop, onRemoveApplication: noop, onRemoveInterview: noop,
                onStartEdit: noop, onStartEditTask: noop, onStartEditInterview: noop, onStatusChange: noop, onUpdateNotes: noop, onViewInterview: noop }),
    },
    import: {
        view: h(ImportDrawer, { importCapture: {}, importDraft:null,
            importDuplicates:[], importErrors:{}, importStep:'review',
            importReview:{ title:'Product Designer', companyName:'Northstar', status:'SAVED', location:'Remote', dateApplied:'', source:'LinkedIn', sourceUrl:'https://example.com/careers/product-designer', salaryMin:'120000', salaryMax:'160000', notes:'' },
            isImportSubmitting:false, parserDebug:null, onCaptureChange:noop, onClose:noop,
            onCreateDraft:noop, onReviewChange:noop, onReviewSubmit:noop, onStepChange:noop }),
    },
    analytics: {
        view: h(SourceQualityTable, { applications, historyByApp, interviews }),
    },
    interviews: {
        view: h(InterviewsView, { applications, interviews, focusedInterviewId: 'interview-0',
            onCreateInterview: noop, onRemoveInterview: noop, onOutcomeChange: noop,
            onUpdateNotes: noop, onStartEdit: noop, onViewApplication: noop }),
    },
};

async function exportHero(buffer, name, width, height) {
    for (const format of ['webp', 'avif']) {
        await sharp(buffer).resize(width, height).toFormat(format, { quality: format === 'webp' ? 88 : 65 })
            .toFile(path.join(output, name + '.' + format));
    }
    console.log('Captured ' + name + ' (WebP + AVIF)');
}

// Capture application and interview workspaces intact, including both panes.
// Other story assets retain their focused component excerpts.
async function captureStory(page) {
    const markup = Object.fromEntries(Object.entries(views).map(([name, view]) => [name, renderToStaticMarkup(view.view)]));
    const selectedStory = process.argv.find(arg => arg.startsWith('--story='))?.slice('--story='.length);
    if (selectedStory && !views[selectedStory]) throw new Error(`Unknown story: ${selectedStory}`);
    const manifestPath = path.join(output, 'story-screenshots.json');
    const manifest = selectedStory && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    const focusCss = `
        body { margin:0; background:var(--surface-page); }
        .capture { width:100%; }
        .capture .application-detail-panel { display:block!important; position:static!important; inset:auto!important; width:100%!important; min-width:0!important; min-height:0!important; height:auto!important; max-height:none!important; overflow:visible!important; border:0; border-radius:0; box-shadow:none; padding:24px!important; }
        .capture .application-detail-layout, .capture .application-detail-main, .capture .interview-detail-layout, .capture .interview-detail-main { display:block; }
        .capture .collection-pane-collapse, .capture .mobile-detail-back, .capture .application-detail-header-actions, .capture .drawer-close { display:none; }
        .capture .application-detail-header { margin:0; padding:0 0 12px; }
        .capture .application-detail-company-location { margin-block:8px; }
        .capture .application-detail-heading h2 { font-size:24px; }
        .capture .application-detail-card-section { margin:0; padding:16px 0 0; min-height:0; }
        .capture .application-detail-status-date { font-size:13px; }
        .capture .application-detail-section-heading { padding:0; margin:0 0 8px; }
        .capture .application-interview-item { display:flex!important; align-items:center; flex-wrap:wrap; gap:8px; min-height:0; }
        .capture .application-interview-item>div:first-child { min-width:0; flex:1 1 140px; }
        .capture .application-interview-item>div:not(:first-child) { flex:0 0 auto; }
        .capture .application-interview-item>div:has(.application-interview-icon-button) { display:none; }
        .capture .application-interview-icon-button { display:none; }
        .capture .application-resume-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .capture .interview-detail-body { display:grid; gap:16px; padding:0; margin:0; border:0; }
        .capture .detail-facts-section { padding:0; margin:0; border:0; }
        .capture .collection-notes-section { margin:0; padding:0; border:0; }
        .capture .collection-notes-heading { padding:0; margin:0 0 8px; }
        .capture .collection-notes-section p { margin:0; padding:12px; min-height:0; }
        .capture .interview-detail-facts { margin-top:12px; }
        .capture .interview-detail-fact { padding:8px 12px; }
        .capture .capture-task { margin:0; padding:0; border:0; }
        .capture .drawer-header { padding:20px 24px; }
        .capture .drawer-header h2 { font-size:24px; }
        .capture .form-section { padding:16px 24px; }
        .capture .form-section>label { margin-top:12px; }
        .capture .drawer-footer { position:static; padding:16px 24px; }
        .capture .drawer-footer>button:not(.primary) { display:none; }
        .capture .source-quality-panel { padding:24px; border:0; box-shadow:none; }
        .capture .source-quality-table-wrap { overflow:visible; }
        .capture .source-quality-table { display:table; min-width:0; width:100%; }
        .capture .source-quality-table thead { display:table-header-group; position:static; width:auto; height:auto; overflow:visible; clip:auto; clip-path:none; white-space:normal; }
        .capture .source-quality-table tbody { display:table-row-group; }
        .capture .source-quality-table tr { display:table-row; border:0; padding:0; }
        .capture .source-quality-table th, .capture .source-quality-table td { display:table-cell; padding:18px 12px; width:auto; }
        .capture .source-quality-table :is(th,td):nth-child(2), .capture .source-quality-table :is(th,td):nth-child(n+4) { display:none; }
        .capture .source-quality-table td::before { display:none; }
        .capture .source-quality-table td strong { font-size:22px; }
        .capture .source-quality-table td span { font-size:13px; }
        @media(max-width:400px) {
            .capture .application-detail-panel { padding:20px!important; }
            .capture .application-detail-heading h2 { font-size:21px; }
            .capture .application-detail-header .application-detail-date-row { display:none; }
            .capture .application-resume-item { flex-wrap:wrap; }
            .capture .application-resume-download { display:none; }
            .capture .application-resume-item>div:has(.application-resume-download) { display:none; }
            .capture .application-interview-item { padding:12px; }
            .capture .application-interview-item strong { white-space:normal; overflow:visible; }
            .capture .application-interview-item>div>span { font-size:12px; }
            .capture .source-quality-panel { padding:20px; }
            .capture .source-quality-table th, .capture .source-quality-table td { padding:16px 8px; }
            .capture .source-quality-source { font-size:14px; }
            .capture .interview-detail-fact { grid-template-columns:120px 1fr; gap:12px; }
            .capture .form-section { padding:12px 20px; }
        }
    `;
    for (const [name, source] of Object.entries(markup)) {
        if (selectedStory && name !== selectedStory) continue;
        manifest[name] = {};
        const fullWorkspace = name === 'applications' || name === 'interviews';
        for (const theme of ['light', 'dark']) {
            for (const mobile of fullWorkspace ? [false] : [false, true]) {
                const width = mobile ? 360 : 600;
                await page.setViewportSize({ width: fullWorkspace ? 1280 : width, height:fullWorkspace ? 850 : 1200 });
                await page.setContent(`<!doctype html><html lang="en" data-theme="${theme}"><head><style>${preflight}\n${fontCss}\n${css}\n${fullWorkspace ? '' : focusCss}</style></head><body><main class="capture">${source}</main></body></html>`);
                if (!fullWorkspace) await page.evaluate(({ name }) => {
                    const root = document.querySelector('.capture');
                    const get = (selector, scope = root) => {
                        const element = scope.querySelector(selector);
                        if (!element) throw new Error(`Missing capture element: ${selector}`);
                        return element.outerHTML;
                    };
                    if (name === 'import') {
                        // The actual review step, focused on the extracted primary fields.
                        const drawer = root.querySelector('.import-drawer');
                        const primary = drawer.querySelector('.form-section');
                        [...primary.querySelectorAll('label')].slice(2).forEach(el => el.remove());
                        root.innerHTML = get('.drawer-header') + primary.outerHTML + get('.drawer-footer');
                        root.querySelector('.form-section').querySelector('h3').remove();
                    } else if (name === 'analytics') {
                        root.innerHTML = get('.source-quality-panel');
                    }
                }, { name });
                await page.evaluate(() => document.fonts.ready);
                const file = `${name}${mobile ? '-mobile' : ''}${theme === 'dark' ? '-dark' : ''}.webp`;
                let buffer;
                if (fullWorkspace) {
                    buffer = await page.screenshot({ fullPage:false });
                } else {
                    buffer = await page.locator('.capture').screenshot();
                }
                const image = sharp(buffer);
                const saved = await image.webp({ quality:95 }).toFile(path.join(output, file));
                manifest[name][`${mobile ? 'mobile' : 'desktop'}${theme === 'dark' ? 'Dark' : 'Light'}`] = {
                    src:`/landing/${file}`, width:saved.width, height:saved.height,
                };
                // Keep both panes visible on small landing-page screens too;
                // the caption links to the original, full-resolution capture.
                if (fullWorkspace) manifest[name][`mobile${theme === 'dark' ? 'Dark' : 'Light'}`] = manifest[name][`desktop${theme === 'dark' ? 'Dark' : 'Light'}`];
                console.log('Captured ' + file);
            }
        }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

async function main() {
    const browser = await chromium.launch({ headless: true, channel: process.env.LANDING_BROWSER_CHANNEL || 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
        await captureStory(page);
        if (process.argv.includes('--story-only')) return;
        // The real preview route hydrates the chart and uses the current responsive shell.
        await page.setViewportSize({ width: 1800, height: 973 });
        await page.goto(baseUrl + '/dashboard-preview', { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.locator('.sankey-canvas').waitFor({ state: 'visible' });
        // Hide development chrome, which is not part of the product.
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        const desktop = await page.screenshot();
        await exportHero(desktop, 'dashboard-preview-1440', 1440, 778);
        await exportHero(desktop, 'dashboard-preview-960', 960, 519);
        await page.setViewportSize({ width: 480, height: 1000 });
        await page.locator('.sankey-canvas').waitFor({ state: 'visible' });
        // Focus on complete dashboard widgets so the sticky header cannot cover them.
        await page.addStyleTag({ content: '.topbar{visibility:hidden}' });
        const mobile = await page.locator('.pipeline-stats-container').screenshot();
        await exportHero(mobile, 'dashboard-preview-mobile-720', 720);
        await exportHero(mobile, 'dashboard-preview-mobile-480', 480);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

