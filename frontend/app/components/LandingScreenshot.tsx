"use client";

import Image from "next/image";
import { useState } from "react";
import { AppIcon } from "./AppIcon";

export function LandingScreenshot({ name, alt }: { name: string; alt: string }) {
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
                    src={`/landing/${name}.png`}
                    alt={alt}
                    width={1600}
                    height={1000}
                    sizes="(max-width: 850px) 100vw, 600px"
                    onError={() => setMissing(true)}
                />
            )}
        </div>
    );
}
