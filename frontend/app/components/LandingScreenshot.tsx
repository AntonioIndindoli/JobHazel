"use client";

import Image from "next/image";
import { useState } from "react";
import { AppIcon } from "./AppIcon";
import screenshots from "../../public/landing/story-screenshots.json";

type LandingScreenshotProps = {
    name: keyof typeof screenshots;
    alt: string;
    caption: string;
    fullPage?: boolean;
};

export function LandingScreenshot({ name, alt, caption, fullPage = false }: LandingScreenshotProps) {
    const [missing, setMissing] = useState(false);
    const screenshot = screenshots[name];

    return (
        <figure className="story-screenshot">
            <div className="story-screenshot-frame">
                {missing ? (
                    <div className="story-screenshot-placeholder" role="img" aria-label={alt}>
                        <AppIcon name="view" size={28} /><span>{alt}</span>
                    </div>
                ) : (["Light", "Dark"] as const).map((theme) => {
                    const desktop = screenshot[`desktop${theme}`];
                    const mobile = screenshot[`mobile${theme}`];
                    return (
                        <picture key={theme} className={`story-screenshot-${theme.toLowerCase()}`}>
                            <source media="(max-width: 600px)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />
                            <Image src={desktop.src} width={desktop.width} height={desktop.height} alt={alt} sizes={fullPage ? "(max-width: 1344px) calc(100vw - 64px), 1280px" : "(max-width: 1000px) calc(100vw - 48px), 680px"} onError={() => setMissing(true)} />
                        </picture>
                    );
                })}
            </div>
        </figure>
    );
}
