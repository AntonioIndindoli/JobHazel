"use client";

import Image from "next/image";
import { AppIcon } from "./AppIcon";
import { LandingImportDemo } from "./LandingImportDemo";
import { LandingScreenshot } from "./LandingScreenshot";

const chapters = [
    { label: "Save", href: "#job-import" },
    { label: "Organize", href: "#pipeline" },
    { label: "Follow through", href: "#follow-through" },
    { label: "Learn", href: "#insights" },
];

export function LandingProductStory({ onGetStarted }: { onGetStarted: () => void }) {
    return (
        <div className="landing-story">
            <section className="story-features" id="features" aria-labelledby="story-title">
                <header className="story-introduction">
                    <div className="story-introduction-copy">
                        <h2 id="story-title">Bring your whole job search together.</h2>
                    </div>
                    <nav className="story-path" aria-label="Your job search with JobHazel">
                        <ol>
                            {chapters.map((chapter, index) => (
                                <li key={chapter.href}>
                                    <a href={chapter.href}>{chapter.label}</a>
                                    {index < chapters.length - 1 && <AppIcon name="arrow-right" size={16} />}
                                </li>
                            ))}
                        </ol>
                    </nav>
                </header>

                <div className="story-chapters">
                    <article className="story-chapter story-save" id="job-import" aria-labelledby="story-save-title">
                        <div className="story-feature-copy" data-reveal>
                            <span className="story-eyebrow">Save</span>
                            <h3 id="story-save-title">Easy job imports.</h3>
                            <p>Paste a job link. JobHazel extracts the details for you to review and save to your portfolio.</p>
                            <aside className="story-extension-card" aria-labelledby="story-extension-title">
                                <div>
                                    <h4 id="story-extension-title">Save directly from Chrome.</h4>
                                    <p>Our extension captures the posting so you can review and save without leaving the page.</p>
                                    <span className="story-extension-status">Chrome Web Store launch coming soon</span>
                                </div>
                            </aside>
                        </div>
                        <div className="story-visual story-import-visual" data-reveal>
                            <LandingImportDemo />
                        </div>
                    </article>

                    <article className="story-chapter story-organize story-workspace" id="pipeline" aria-labelledby="story-organize-title">
                        <div className="story-feature-copy" data-reveal>
                            <span className="story-eyebrow">Organize</span>
                            <h3 id="story-organize-title">Every application, organized.</h3>
                            <p id="resumes">Find the status, resume you sent, notes, and next task together in each application.</p>
                        </div>
                        <div className="story-visual" data-reveal>
                            <LandingScreenshot name="applications" fullPage alt="Applications workspace with the job list alongside the selected Northstar role, its resume, tasks, and interviews" caption="Applications" />
                        </div>
                    </article>

                    <article className="story-chapter story-follow story-workspace" id="follow-through" aria-labelledby="story-follow-title">
                        <div className="story-feature-copy" data-reveal>
                            <span className="story-eyebrow">Follow through</span>
                            <h3 id="story-follow-title">Walk into every interview prepared.</h3>
                            <p>Keep interview times, meeting links, prep notes, and follow-up tasks connected to the role.</p>
                        </div>
                        <div className="story-visual" data-reveal>
                            <LandingScreenshot name="interviews" fullPage alt="Interviews workspace with the interview list alongside the selected Northstar interview, meeting details, and preparation notes" caption="Interviews" />
                        </div>
                    </article>

                    <article className="story-chapter story-learn" id="insights" aria-labelledby="story-learn-title">
                        <div className="story-feature-copy" data-reveal>
                            <span className="story-eyebrow">Learn</span>
                            <h3 id="story-learn-title">See what gets a response.</h3>
                            <p>Compare application response rates by job source or resume.</p>
                        </div>
                        <div className="story-visual story-insights-visual" data-reveal>
                            <LandingScreenshot name="analytics" alt="Example comparison of 72 submitted applications: Indeed has eight responses from 30 submissions, LinkedIn five from 24, and company websites three from 18" caption="72 submitted applications" />
                        </div>
                    </article>
                </div>
            </section>

            <section className="story-cta story-container" aria-labelledby="story-cta-title">
                <div className="story-cta-copy"><h2 id="story-cta-title">Get started today.</h2></div>
                <div className="story-cta-action">
                    <button type="button" className="landing-button landing-button-light" onClick={onGetStarted}>Start for free <AppIcon name="arrow-right" size={18} /></button>
                    <p>No credit card required.</p>
                </div>
            </section>

            <footer className="story-footer story-container">
                <a className="landing-brand" href="#top"><Image src="/JobHazelIcon.png" alt="" width={32} height={32} /><span>JobHazel</span></a>
                <span className="story-copyright">© {new Date().getFullYear()} JobHazel</span>
            </footer>
        </div>
    );
}
