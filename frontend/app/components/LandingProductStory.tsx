"use client";

import Image from "next/image";
import { LandingScreenshot } from "./LandingScreenshot";

import { AppIcon } from "./AppIcon";

export function LandingProductStory({ onGetStarted }: { onGetStarted: () => void }) {
    return (
        <div className="landing-story">
            <section className="story-features story-container" id="features" aria-label="JobHazel features">
                <article className="story-pipeline" id="pipeline" data-reveal>
                    <div className="story-feature-copy">
                        <span className="story-eyebrow"><AppIcon name="pipeline" size={16} /> Application tracking</span>
                        <h3>See the whole search.<br />Know your next move.</h3>
                        <p>Give every opportunity a home, from the first saved job to the final decision.</p>
                        <ul className="story-checks">
                            <li><AppIcon name="check" size={17} /> Move applications through each hiring stage.</li>
                            <li><AppIcon name="check" size={17} /> Keep the resume, interviews, and next steps connected to each role.</li>
                            <li><AppIcon name="check" size={17} /> Find job details, notes, and past activity when you need them.</li>
                        </ul>
                    </div>
                    <LandingScreenshot name="applications" alt="Application tracking preview" />
                </article>

                <div className="story-feature-pair">
                    <article className="story-feature-tile story-import" id="job-import" data-reveal>
                        <div className="story-feature-copy">
                            <span className="story-eyebrow"><AppIcon name="import" size={16} /> Job import</span>
                            <h3>Start with a job link.<br />Save the details faster.</h3>
                            <p>Paste a job URL or description. JobHazel extracts details into a draft you can review, edit, and add to your pipeline.</p>
                            <div className="story-extension-note">
                                <strong>Save as you browse with the Chrome extension</strong>
                                <p>Capture a job link and any selected description text, then review and save the draft in a side panel beside the posting.</p>
                                <span>Chrome Web Store release coming soon.</span>
                            </div>
                        </div>
                        <LandingScreenshot name="import" alt="Job import preview" />
                    </article>

                    <article className="story-feature-tile story-insights" id="insights" data-reveal>
                        <div className="story-feature-copy">
                            <span className="story-eyebrow"><AppIcon name="analytics" size={16} /> Search insights</span>
                            <h3>Compare your sources.<br />Track your results.</h3>
                            <p>See response rates, interviews, offers, and response times by job source. Compare recorded outcomes across resume versions as your application history grows.</p>
                            <ul className="story-checks">
                                <li><AppIcon name="check" size={17} /> Compare sources by outcomes, not just application counts.</li>
                                <li><AppIcon name="check" size={17} /> Follow your weekly application activity.</li>
                                <li><AppIcon name="check" size={17} /> Use patterns in your search to plan your next steps.</li>
                            </ul>
                        </div>
                        <LandingScreenshot name="analytics" alt="Search analytics preview" />
                    </article>
                </div>
                <article className="story-resumes story-feature-copy" id="resumes" data-reveal>
                    <div>
                        <span className="story-eyebrow"><AppIcon name="document" size={16} /> Resume versions</span>
                        <h3>Know which resume<br />went with which role.</h3>
                        <p>Keep your PDF resume versions organized and link the right one to each application. Return to it when it is time to prepare for an interview.</p>
                    </div>
                    <ul className="story-resume-benefits">
                        <li><strong>Keep each version distinct</strong><p>Upload a revised PDF as a new version, with its own name and notes.</p></li>
                        <li><strong>Keep the application connected</strong><p>Find and download the linked resume directly from the application details.</p></li>
                        <li><strong>Compare recorded outcomes</strong><p>See responses, interviews, and offers grouped by the resume linked to each application.</p></li>
                    </ul>
                </article>
            </section>

            <section className="story-follow-through" id="follow-through" aria-labelledby="story-follow-title">
                <div className="story-container story-follow-grid">
                    <div className="story-follow-copy" data-reveal>
                        <h2 id="story-follow-title">Know what needs<br />your attention next.</h2>
                        <div className="story-follow-benefits">
                            <div><AppIcon name="calendar" size={21} /><span><strong>Walk into interviews ready</strong><p>See upcoming interviews with meeting links and prep notes connected to the role.</p></span></div>
                            <div><AppIcon name="contacts" size={21} /><span><strong>Remember the people behind the role</strong><p>Connect recruiters, referrals, and hiring managers to your applications.</p></span></div>
                            <div><AppIcon name="checklist" size={21} /><span><strong>Turn next steps into a daily plan</strong><p>See due and overdue tasks. Optionally create follow-up and thank-you tasks automatically inside JobHazel.</p></span></div>
                        </div>
                    </div>
                    <div data-reveal><LandingScreenshot name="interviews" alt="Interviews and follow-ups preview" /></div>
                </div>
            </section>

            <section className="story-cta story-container" aria-labelledby="story-cta-title" data-reveal>
                <div className="story-cta-orbit story-cta-orbit-one" aria-hidden="true" /><div className="story-cta-orbit story-cta-orbit-two" aria-hidden="true" />
                <div className="story-cta-copy"><h2 id="story-cta-title">Organize your<br />job search.</h2><p>Free to get started. No credit card required.<br />Take the next step with JobHazel.</p></div>
                <div className="story-cta-action"><button type="button" className="landing-button landing-button-light" onClick={onGetStarted}>Get Started <AppIcon name="arrow-right" size={18} /></button></div>
            </section>

            <footer className="story-footer story-container">
                <div><a className="landing-brand" href="#top"><Image src="/JobHazelIcon.png" alt="" width={32} height={32} /><span>JobHazel</span></a></div>
                <nav aria-label="Footer navigation"><a href="#job-import">Job import</a><a href="#resumes">Resumes</a><a href="#insights">Insights</a><a className="story-back-top" href="#top">Back to top ↑</a></nav>
                <span className="story-copyright">© {new Date().getFullYear()} JobHazel</span>
            </footer>
        </div>
    );
}
