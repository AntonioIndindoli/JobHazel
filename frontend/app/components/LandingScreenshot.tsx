"use client";

import Image from "next/image";
import { useState } from "react";
import { AppIcon } from "./AppIcon";
import applications from "../../public/landing/applications.png";
import jobImport from "../../public/landing/import.png";
import analytics from "../../public/landing/analytics.png";
import interviews from "../../public/landing/interviews.png";

const screenshots = { applications, import: jobImport, analytics, interviews };

export function LandingScreenshot({ name, alt }: { name: keyof typeof screenshots; alt: string }) {
    const [missing, setMissing] = useState(false);

    return (
        <div className="story-screenshot">
            {missing ? (
                <div className="story-screenshot-placeholder" role="img" aria-label={alt}>
                    <AppIcon name="view" size={28} />
                    <span>{alt}</span>
                </div>
            ) : (
                <Image
                    src={screenshots[name]}
                    alt={alt}
                    sizes="(max-width: 850px) 100vw, 600px"
                    onError={() => setMissing(true)}
                />
            )}
        </div>
    );
}
