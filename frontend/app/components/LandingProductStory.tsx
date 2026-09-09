"use client";

import Image from "next/image";
import { LandingScreenshot } from "./LandingScreenshot";

import { AppIcon } from "./AppIcon";

const faqs = [
    { question: "Is JobHazel free to get started?", answer: "Yes. You can create an account and start organizing your job search for free, with no credit card required." },
    { question: "How do I add jobs to my workspace?", answer: "Enter a job manually, or paste the posting text and its URL into the import flow. JobHazel creates a draft with the details it can identify, including the role, company, location, and salary. You can review and correct everything before saving." },
    { question: "How do follow-up reminders work?", answer: "Create tasks with due dates and see upcoming or overdue work in your workspace. You can also enable task automation to create application follow-ups and interview thank-you tasks, with a delay you choose. These are tasks inside JobHazel, so you can review and complete them when you are ready." },
    { question: "Does JobHazel apply to jobs for me?", answer: "You submit applications directly with the employer or job board. JobHazel helps you manage everything around that process: saved roles, application stages, interview details, contacts, notes, and follow-ups." },
];

export function LandingProductStory({ onGetStarted }: { onGetStarted: () => void }) {
    return (
        <div className="landing-story">
            <nav className="story-overview" aria-label="Explore JobHazel features">
                <span>Your search. All together.</span>
                <a href="#pipeline"><AppIcon name="applications" size={18} /> Applications</a>
                <a href="#follow-through"><AppIcon name="calendar" size={18} /> Interviews</a>
                <a href="#follow-through"><AppIcon name="contacts" size={18} /> Contacts</a>
                <a href="#follow-through"><AppIcon name="checklist" size={18} /> Follow-ups</a>
                <a href="#insights"><AppIcon name="analytics" size={18} /> Insights</a>
            </nav>

            <section className="story-features story-container" id="features" aria-labelledby="story-features-title">
                <div className="story-section-heading" data-reveal>
                    <h2 id="story-features-title">Organize your job search.</h2>
                    <p>Time is money. Stop wasting it sifting through inboxes, emails, and spreadsheets.</p>
                </div>

                <article className="story-pipeline" id="pipeline" data-reveal>
                    <div className="story-feature-copy">
                        <span className="story-eyebrow"><AppIcon name="pipeline" size={16} /> Application tracking</span>
                        <h3>See the whole search.<br />Know your next move.</h3>
                        <p>Keep every role and its progress in one place.</p>
                        <ul className="story-checks">
                            <li><AppIcon name="check" size={17} /> Move applications through each hiring stage.</li>
                            <li><AppIcon name="check" size={17} /> Keep salary, job links, and notes with the role.</li>
                            <li><AppIcon name="check" size={17} /> Find what you need with search and filters.</li>
                        </ul>
                    </div>
                    <LandingScreenshot name="applications" alt="Application tracking preview" />
                </article>

                <div className="story-feature-pair">
                    <article className="story-feature-tile story-import" data-reveal>
                        <div className="story-feature-copy">
                            <span className="story-eyebrow"><AppIcon name="import" size={16} /> Job import</span>
                            <h3>Paste the link,<br />then let JobHazel do the rest.</h3>
                            <p>JobHazel analyzes the job posting and picks out the details for a draft you can review, edit, and add to your pipeline.</p>
                        </div>
                        <LandingScreenshot name="import" alt="Job import preview" />
                    </article>

                    <article className="story-feature-tile story-insights" id="insights" data-reveal>
                        <div className="story-feature-copy">
                            <span className="story-eyebrow"><AppIcon name="analytics" size={16} /> Search insights</span>
                            <h3>Put your energy<br />where it pays off.</h3>
                            <p>See how applications turn into interviews and offers. Compare your sources, spot patterns, and make your next week more focused.</p>
                        </div>
                        <LandingScreenshot name="analytics" alt="Search analytics preview" />
                    </article>
                </div>
            </section>

            <section className="story-follow-through" id="follow-through" aria-labelledby="story-follow-title">
                <div className="story-container story-follow-grid">
                    <div className="story-follow-copy" data-reveal>
                        <span className="story-eyebrow">The details make the difference</span>
                        <h2 id="story-follow-title">Show up prepared.<br />Follow through<br /> <em>with confidence.</em></h2>
                        <p>The meeting link. The recruiter’s name. That note you wanted to send. Keep the little things connected, so you can focus on the conversation.</p>
                        <div className="story-follow-benefits">
                            <div><AppIcon name="calendar" size={21} /><span><strong>Walk into interviews ready</strong><p>Keep dates, meeting links, prep notes, and outcomes together.</p></span></div>
                            <div><AppIcon name="contacts" size={21} /><span><strong>Remember the people behind the role</strong><p>Connect recruiters, referrals, and hiring managers to your applications.</p></span></div>
                            <div><AppIcon name="checklist" size={21} /><span><strong>Give every next step a due date</strong><p>Track prep and follow-ups. Enable automatic follow-up and thank-you tasks.</p></span></div>
                        </div>
                    </div>
                    <div data-reveal><LandingScreenshot name="interviews" alt="Interviews and follow-ups preview" /></div>
                </div>
            </section>

            <section className="story-faq story-container" id="questions" aria-labelledby="story-faq-title">
                <div data-reveal><span className="story-eyebrow">FAQ</span><h2 id="story-faq-title">A few things<br /> you might be wondering.</h2></div>
                <div className="story-faq-list" data-reveal>{faqs.map((faq) => (<details key={faq.question}><summary>{faq.question}<AppIcon name="plus" size={19} /></summary><p>{faq.answer}</p></details>))}</div>
            </section>

            <section className="story-cta story-container" aria-labelledby="story-cta-title" data-reveal>
                <div className="story-cta-orbit story-cta-orbit-one" aria-hidden="true" /><div className="story-cta-orbit story-cta-orbit-two" aria-hidden="true" />
                <div className="story-cta-copy"><h2 id="story-cta-title">100% free.<br />No credit card required.</h2><p>Bring your opportunities together.<br />Take the next step with JobHazel.</p></div>
                <div className="story-cta-action"><button type="button" className="landing-button landing-button-light" onClick={onGetStarted}>Start tracking <AppIcon name="arrow-right" size={18} /></button></div>
            </section>

            <footer className="story-footer story-container">
                <div><a className="landing-brand" href="#top"><Image src="/JobHazelIcon.png" alt="" width={32} height={32} /><span>JobHazel</span></a></div>
                <nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#questions">FAQs</a><a className="story-back-top" href="#top">Back to top ↑</a></nav>
                <span className="story-copyright">© {new Date().getFullYear()} JobHazel</span>
            </footer>
        </div>
    );
}
