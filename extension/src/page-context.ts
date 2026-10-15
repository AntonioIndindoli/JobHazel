import type { CapturedPageContext } from "./capture.js";

export type PageContextResult = CapturedPageContext | { error: string };

// Chrome serializes this function for injection. Keep helpers and constants
// inside it so it does not depend on the service worker's module scope.
export async function readPageContext(waitMs = 3_000): Promise<PageContextResult> {
  const pageUrl = new URL(window.location.href);
  const isLinkedInJob = /(^|\.)linkedin\.com$/i.test(pageUrl.hostname) && /^\/jobs(?:\/|$)/.test(pageUrl.pathname);
  const isCareerTakesJob = /^(?:www\.)?careertakes\.ai$/i.test(pageUrl.hostname) && /^\/jobs\/apply\/?$/.test(pageUrl.pathname);
  const byteDanceJobId = /^(?:www\.)?joinbytedance\.com$/i.test(pageUrl.hostname)
    ? pageUrl.pathname.match(/^\/search\/(\d+)\/?$/)?.[1] : null;

  const panelSelector = [
    '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]',
    ".jobs-search__job-details--container", ".jobs-search__job-details",
    ".jobs-search-two-pane__job-details", ".jobs-details__main-content",
    ".jobs-details", ".job-view-layout", ".scaffold-layout__detail",
    "[data-test-id='job-details']",
  ].join(",");
  const descriptionSelectors = [
    '[id^="JobDetails_AboutTheJob_"]',
    "#job-details", ".jobs-description__content", ".jobs-description-content__text",
    ".jobs-description .jobs-box__html-content", ".description__text .show-more-less-html__markup",
  ];
  const titleSelectors = [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title", ".top-card-layout__title", "h1", "h2 a[href*='/jobs/view/']",
  ];
  const companySelectors = [
    ".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link", "a[href*='/company/']",
  ];
  const locationSelectors = [
    ".job-details-jobs-unified-top-card__tertiary-description-container",
    ".job-details-jobs-unified-top-card__primary-description-container .tvm__text--low-emphasis",
    ".jobs-unified-top-card__bullet", ".topcard__flavor--bullet",
  ];

  function visible(element: Element): boolean {
    if (element.closest("[hidden], [aria-hidden='true']")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // LinkedIn SDUI wrappers use display: contents, so the wrapper has no box.
    return element.getClientRects().length > 0 ||
      ((style.display === "contents" || element.hasAttribute("data-display-contents")) &&
        Array.from(element.children).some(visible));
  }

  function text(element: Element | null): string {
    if (!element) return "";
    return ((element as HTMLElement).innerText ?? element.textContent ?? "")
      .replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  }

  function first(root: Element, selectors: string[]): Element | null {
    for (const selector of selectors) {
      const match = Array.from(root.querySelectorAll(selector)).find((element) => visible(element) && text(element));
      if (match) return match;
    }
    return null;
  }

  function jobIdFromUrl(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value, pageUrl);
      if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
      const queryId = url.searchParams.get("currentJobId");
      if (queryId && /^\d+$/.test(queryId)) return queryId;
      return url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1] ?? null;
    } catch { return null; }
  }

  function panelFor(description: Element): Element | null {
    const known = description.closest(panelSelector);
    // Semantic fallback for layouts whose CSS class names have changed.
    // A main-content wrapper may hold only the description, with a sibling header.
    let parent = known ?? description.parentElement;
    while (parent && parent !== document.body) {
      if (parent.querySelector(".jobs-search-results-list, .jobs-search-results, .jobs-search__results-list")) return null;
      if (first(parent, titleSelectors)) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  function descriptionText(root: Element): string {
    // The observed SDUI description has lists outside its expandable-text span.
    // Read the whole AboutTheJob section with line breaks, excluding UI controls.
    function read(node: Node): string {
      if (node.nodeType === 3) return node.textContent ?? "";
      if (node.nodeType !== 1) return "";
      const element = node as Element;
      if (/^(BUTTON|INPUT|SELECT|TEXTAREA|SCRIPT|STYLE|SVG)$/.test(element.tagName) ||
        element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true" ||
        window.getComputedStyle(element).display === "none") return "";
      if (element.tagName === "BR") return "\n";
      const content = Array.from(element.childNodes).map(read).join("");
      return /^(DIV|P|UL|OL|LI|H[1-6]|SECTION|ARTICLE)$/.test(element.tagName) ? `\n${content}\n` : content;
    }
    return read(root).replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function sduiHeader(panel: Element, description: Element, jobId: string | null) {
    for (const link of Array.from(panel.querySelectorAll("a[href*='/jobs/view/']"))) {
      const linkJobId = jobIdFromUrl(link.getAttribute("href"));
      if (!linkJobId || (jobId && linkJobId !== jobId) || !visible(link) || !text(link)) continue;
      // Skip compact sticky headers: the main header has the company link and
      // location paragraph together, before the description and network widgets.
      for (let parent = link.parentElement; parent && parent !== panel && !parent.contains(description); parent = parent.parentElement) {
        const company = text(first(parent, ["a[href*='/company/']"])).replace(/\s+/g, " ");
        if (!company) continue;
        const paragraphs = Array.from(parent.querySelectorAll("p")).filter(visible).map(text);
        const location = paragraphs.find((line) => /[·•]/.test(line) && !/^(?:Promoted|Responses)/i.test(line))
          ?.split(/\s*[·•]\s*/)[0]?.trim() ?? "";
        const insightsRoot = parent.parentElement && !parent.parentElement.contains(description) ? parent.parentElement : parent;
        const insights = Array.from(insightsRoot.querySelectorAll("a[href*='/jobs/search-results/']"))
          .filter(visible).map(text).filter((line) => /^(?:Hybrid|Remote|On[- ]site|Full[- ]time|Part[- ]time|Contract|Temporary|Internship|[$€£])/i.test(line));
        return { titleElement: link, company, location, insights };
      }
    }
    return null;
  }

  if (byteDanceJobId) {
    const deadline = Date.now() + Math.max(0, Math.min(waitMs, 3_000));
    let previousSnapshot = "";
    do {
      if (window.location.href !== pageUrl.href) return { error: "The ByteDance job changed during capture. Capture the current posting again." };
      let snapshot: CapturedPageContext | null = null;
      for (const apply of Array.from(document.querySelectorAll('[data-tracking="job-apply-button"]'))) {
        if (apply.getAttribute("tracking-value") !== byteDanceJobId || !visible(apply)) continue;
        // The header and description are sibling sections. Find their shared
        // wrapper, stopping before site navigation and the footer.
        for (let panel = apply.parentElement; panel && panel !== document.body; panel = panel.parentElement) {
          if (!visible(panel) || panel.closest("[aria-busy='true']")) continue;
          const title = text(first(panel, ["h1", "h2"]));
          const sections = Array.from(panel.querySelectorAll(".bd-title")).filter(visible);
          if (!title || !sections.some((el) => text(el) === "Responsibilities") ||
            !sections.some((el) => text(el) === "Qualifications")) continue;
          if (Array.from(panel.querySelectorAll('[data-tracking="job-apply-button"]'))
            .some((el) => el.getAttribute("tracking-value") !== byteDanceJobId)) continue;
          const jobText = sections.map((el) => el.parentElement ? descriptionText(el.parentElement) : "").join("\n\n");
          if (jobText.length < 100) continue;
          const field = (label: string) => {
            const marker = Array.from(panel.querySelectorAll("p")).find((el) => visible(el) && text(el).replace(/\s*:\s*$/, "") === label);
            return text(marker?.nextElementSibling ?? null);
          };
          snapshot = {
            sourceUrl: pageUrl.href, pageTitle: title,
            rawText: [`Job title: ${title}`, "Company: ByteDance", field("Location") && `Location: ${field("Location")}`,
              field("Employment Type") && `Employment Type: ${field("Employment Type")}`, jobText].filter(Boolean).join("\n"),
          };
          break;
        }
        if (snapshot) break;
      }
      const fingerprint = snapshot ? JSON.stringify(snapshot) : "";
      if (snapshot && (waitMs <= 0 || fingerprint === previousSnapshot)) return snapshot;
      previousSnapshot = fingerprint;
      if (Date.now() >= deadline) break;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    } while (Date.now() <= deadline);
    return { error: "JobHazel could not identify this ByteDance posting. Wait for the job details to finish loading, then capture it again." };
  }

  if (isCareerTakesJob) {
    const expectedId = pageUrl.searchParams.get("id");
    const deadline = Date.now() + Math.max(0, Math.min(waitMs, 3_000));
    let previousSnapshot = "";
    do {
      if (window.location.href !== pageUrl.href) return { error: "The CareerTakes job changed during capture. Capture the current posting again." };
      for (const panel of Array.from(document.querySelectorAll("[data-job-id]"))) {
        if (!expectedId || panel.getAttribute("data-job-id") !== expectedId || !visible(panel) || panel.closest("[aria-busy='true']")) continue;
        // CSS module suffixes change between builds. Both observed A/B layouts
        // retain the component field names inside their class tokens.
        const title = text(first(panel, ['[class*="_jobTitle__"]']));
        const companyInfo = first(panel, ['[class*="_companyInfo__"]']);
        const company = text(companyInfo ? first(companyInfo, ["span"]) : null);
        const description = first(panel, ['[class*="_markdownContent__"]', '[class*="_jobContent__"]']);
        const jobText = description ? descriptionText(description) : "";
        if (!title || !company || jobText.length < 40) continue;
        const location = text(panel.querySelector("svg.lucide-map-pin")?.parentElement?.querySelector("span") ?? null);
        const tags = Array.from(panel.querySelectorAll('[class*="_jobTags__"] span')).filter(visible).map(text);
        const brief = text(first(panel, ['[class*="_jobBrief__"]']));
        const snapshot = {
          sourceUrl: pageUrl.href, pageTitle: title,
          rawText: [`Job title: ${title}`, `Company: ${company}`, location && `Location: ${location}`,
            ...tags, brief, jobText].filter(Boolean).join("\n"),
        };
        const fingerprint = JSON.stringify(snapshot);
        if (waitMs <= 0 || fingerprint === previousSnapshot) return snapshot;
        previousSnapshot = fingerprint;
        break;
      }
      if (Date.now() >= deadline) break;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    } while (Date.now() <= deadline);
    return { error: "JobHazel could not identify this CareerTakes posting. Wait for the job details to finish loading, then capture it again." };
  }

  if (!isLinkedInJob) {
    return {
      sourceUrl: pageUrl.href,
      pageTitle: document.title ?? "",
      rawText: window.getSelection()?.toString() ?? "",
    };
  }

  const expectedJobId = jobIdFromUrl(pageUrl.href);
  const deadline = Date.now() + Math.max(0, Math.min(waitMs, 3_000));
  let previousSnapshot = "";
  do {
    if (window.location.href !== pageUrl.href) {
      return { error: "The selected LinkedIn job changed during capture. Capture the current posting again." };
    }
    let snapshot: CapturedPageContext | null = null;
    const descriptions = new Set(descriptionSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    for (const description of descriptions) {
      if (!visible(description)) continue;
      const sduiPanel = description.closest('[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]');
      const descriptionJobId = description.id.match(/^JobDetails_AboutTheJob_(\d+)$/)?.[1] ?? null;
      if (expectedJobId && descriptionJobId && expectedJobId !== descriptionJobId) continue;
      const panel = sduiPanel ?? panelFor(description);
      if (!panel || panel.closest("[aria-busy='true']")) continue;
      const sdui = sduiPanel ? sduiHeader(panel, description, expectedJobId ?? descriptionJobId) : null;
      if (sduiPanel && !sdui) continue;
      const titleElement = sdui?.titleElement ?? first(panel, titleSelectors);
      const title = text(titleElement).replace(/\s+/g, " ");
      const jobText = descriptionText(description);
      if (!title || jobText.length < 40) continue;

      const titleLink = titleElement?.closest("a[href]") ?? titleElement?.querySelector("a[href]");
      const panelJobId = jobIdFromUrl(titleLink?.getAttribute("href") ?? null) ??
        panel.getAttribute("data-job-id") ?? titleElement?.closest("[data-job-id]")?.getAttribute("data-job-id");
      // During a list selection change, the URL can update before the details.
      // Never pair the old panel with the newly selected posting's URL.
      if (expectedJobId && panelJobId && expectedJobId !== panelJobId) continue;
      if (descriptionJobId && panelJobId && descriptionJobId !== panelJobId) continue;
      const jobId = descriptionJobId ?? panelJobId ?? expectedJobId;
      if (!jobId || !/^\d+$/.test(jobId)) continue;

      const company = sdui?.company ?? text(first(panel, companySelectors)).replace(/\s+/g, " ");
      const location = sdui?.location ?? text(first(panel, locationSelectors)).split(/\s*[·•]\s*|\n/)[0]?.trim();
      const insights = sdui?.insights ?? Array.from(panel.querySelectorAll(
        ".job-details-jobs-unified-top-card__job-insight, .jobs-unified-top-card__job-insight",
      )).filter(visible).map(text).filter(Boolean);
      snapshot = {
        sourceUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
        pageTitle: title,
        rawText: [
          `Job title: ${title}`, company && `Company: ${company}`, location && `Location: ${location}`,
          ...insights, jobText,
        ].filter(Boolean).join("\n"),
      };
      break;
    }
    // Require two matching reads when waiting, so incomplete SPA updates settle.
    const fingerprint = snapshot ? JSON.stringify(snapshot) : "";
    if (snapshot && (waitMs <= 0 || fingerprint === previousSnapshot)) return snapshot;
    previousSnapshot = fingerprint;
    if (Date.now() >= deadline) break;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  } while (Date.now() <= deadline);
  return { error: "JobHazel could not identify LinkedIn's selected job details. Wait for the right-hand job panel to finish loading, then capture it again." };
}
