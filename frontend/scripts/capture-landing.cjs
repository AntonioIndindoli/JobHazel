// Render the real product components with fictional data, without an account or API.
// Run from frontend with Playwright available (locally or via NODE_PATH).
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
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
const now = new Date();
const date = (days) => new Date(now.getTime() + days * 86400000).toISOString();
const companies = ['Northstar', 'Luma', 'Evergreen', 'Orbit', 'Fieldwork', 'Forma', 'Meridian', 'Juniper'];
const statuses = ['INTERVIEWING', 'OFFER', 'APPLIED', 'SAVED', 'INTERVIEWING', 'APPLIED', 'APPLIED', 'REJECTED'];
const applications = companies.map((companyName, i) => ({
    id: `sample-${i}`, companyName, title: ['Product Designer', 'Senior Product Designer', 'UX Designer', 'Design Engineer'][i % 4],
    status: statuses[i], source: ['LinkedIn', 'Referral', 'Company Website', 'Indeed'][i % 4],
    createdAt: date(-i * 3 - 2), dateApplied: date(-i * 3 - 2), sourceUrl: 'https://example.com/careers',
    location: 'Remote', salaryMin: 120000, salaryMax: 160000,
    description: 'Design thoughtful tools that help people do their best work.',
    notes: 'Prepare two portfolio case studies. Highlight collaboration with engineering and the impact of the onboarding redesign.',
    resumeVersionId: null, resumeVersion: null,
}));
const interviews = [0, 4, 1].map((appIndex, i) => ({
    id: `interview-${i}`, applicationId: applications[appIndex].id,
    applicationTitle: applications[appIndex].title, companyName: companies[appIndex],
    type: ['TECHNICAL', 'MANAGER', 'RECRUITER_SCREEN'][i], outcome: i === 2 ? 'PASSED' : 'SCHEDULED',
    scheduledAt: date(i === 2 ? -3 : i + 2), durationMinutes: 45, location: 'Video call',
    meetingUrl: 'https://example.com/meet/design-team', interviewerName: ['Alex Morgan', 'Sam Rivera', 'Jordan Lee'][i],
    notes: 'Portfolio walkthrough\nShare the onboarding redesign and explain the research behind key decisions.\n\nQuestions for the team\nHow do design and engineering collaborate?\nWhat would success look like in the first 90 days?',
    createdAt: date(-5), updatedAt: date(-1),
}));
const historyByApp = Object.fromEntries(applications.map((app, i) => [app.id,
    ['INTERVIEWING', 'OFFER', 'REJECTED'].includes(app.status) ? [{
        id: `event-${i}`, applicationId: app.id, type: 'STATUS_CHANGED', message: 'Status updated',
        metadata: { from: 'APPLIED', to: app.status }, createdAt: date(-i * 3 + 1),
    }] : [],
]));
const ApplicationsView = component('ApplicationsView.tsx', 'ApplicationsView');
const InterviewsView = component('InterviewsView.tsx', 'InterviewsView');
const ImportDrawer = component('ImportDrawer.tsx', 'ImportDrawer');
const SourceQualityTable = component('dashboard/SourceQualityTable.tsx', 'SourceQualityTable');
const WeeklyApplications = component('dashboard/WeeklyApplications.tsx', 'WeeklyApplications');
const css = fs.readdirSync(path.join(root, 'app/styles')).filter(f => f.endsWith('.css')).sort()
    .map(f => fs.readFileSync(path.join(root, 'app/styles', f), 'utf8')).join('\n');
const preflight = fs.readFileSync(path.join(root, 'node_modules/tailwindcss/preflight.css'), 'utf8');
const font = fs.readFileSync(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2')).toString('base64');
const fontCss = `@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2')} :root{--font-geist-sans:Geist}`;
const views = {
    applications: h(ApplicationsView, { applications, interviews, tasks: [], resumes: [],
        onCreateApplication: noop, onCreateInterview: noop, onCreateTask: noop, onCompleteTask: noop,
        onDownloadResume: noop, onRemoveApplication: noop, onRemoveInterview: noop, onStartEdit: noop,
        onStartEditInterview: noop, onStatusChange: noop, onUpdateNotes: noop, onViewInterview: noop }),
    import: h(ImportDrawer, { importCapture: { sourceUrl: 'https://example.com/careers/product-designer', rawText: '' },
        importDraft: { confidence: .96 }, importDuplicates: [], importErrors: {}, importStep: 'review',
        importReview: { title: 'Product Designer', companyName: 'Northstar', status: 'SAVED', location: 'Remote',
            dateApplied: '', source: 'Company Website', sourceUrl: 'https://example.com/careers/product-designer',
            salaryMin: '120000', salaryMax: '160000', notes: 'Design thoughtful tools for a growing product team.' },
        isImportSubmitting: false, parserDebug: null, onCaptureChange: noop, onClose: noop, onCreateDraft: noop,
        onReviewChange: noop, onReviewSubmit: noop, onStepChange: noop }),
    analytics: h('section', { className: 'applications-page analytics-page' },
        h('header', { className: 'page-header' }, h('div', null, h('h1', null, 'Search insights'), h('span', null, 'See which sources lead to your next opportunity.'))),
        h(SourceQualityTable, { applications, historyByApp, interviews }),
        h(WeeklyApplications, { applications, weeklyRangeWeeks: 4, onWeeklyRangeChange: noop })),
    interviews: h(InterviewsView, { applications, interviews, focusedInterviewId: 'interview-0',
        onCreateInterview: noop, onRemoveInterview: noop, onOutcomeChange: noop,
        onUpdateNotes: noop, onStartEdit: noop, onViewApplication: noop }),
};
async function main() {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 2 });
        for (const [name, view] of Object.entries(views)) {
            const extra = name === 'import'
                ? '.drawer-backdrop{position:static;background:transparent;padding:0;display:block}.import-drawer{position:static;width:100%;max-width:none;height:auto;max-height:none;box-shadow:none;border:0}.capture{width:800px;height:640px;overflow:hidden;margin:auto}'
                : '';
            await page.setContent(`<!doctype html><html lang="en" data-theme="light"><head><style>${preflight}\n${fontCss}\n${css}\nbody{margin:0;padding:28px;background:var(--background)}.capture{width:1144px}.applications-page{min-height:0}.analytics-page{display:grid;gap:24px}${extra}</style></head><body><main class="capture">${renderToStaticMarkup(view)}</main></body></html>`);
            await page.evaluate(() => document.fonts.ready);
            await page.locator('.capture').screenshot({ path: path.join(root, 'public/landing', `${name}.png`) });
            console.log(`Captured ${name}.png`);
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

