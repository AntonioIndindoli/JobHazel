import type { ReactNode } from "react";

import type { AppIconName, IconTone } from "../lib/types";

export function AppIcon({
    name,
    size = 20,
    className,
    strokeWidth = 1.8,
}: {
    name: AppIconName;
    size?: number;
    className?: string;
    strokeWidth?: number;
}) {
    let icon: ReactNode;

    switch (name) {
        case "account":
            icon = (
                <>
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </>
            );
            break;
        case "analytics":
            icon = (
                <>
                    <path d="M4 19V5" />
                    <path d="M4 19h16" />
                    <path d="M8 15v-4" />
                    <path d="M12 15V8" />
                    <path d="M16 15v-6" />
                </>
            );
            break;
        case "applications":
            icon = (
                <>
                    <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" />
                    <path d="M5.5 7h13A1.5 1.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8A1.5 1.5 0 0 1 5.5 7Z" />
                    <path d="M4 12h16" />
                    <path d="M10 12v1.5h4V12" />
                </>
            );
            break;
        case "arrow-left":
            icon = (
                <>
                    <path d="M19 12H5" />
                    <path d="m11 6-6 6 6 6" />
                </>
            );
            break;
        case "arrow-right":
            icon = (
                <>
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                </>
            );
            break;
        case "bell":
            icon = (
                <>
                    <path d="M18 10.5a6 6 0 0 0-12 0c0 6-2 6.5-2 6.5h16s-2-.5-2-6.5Z" />
                    <path d="M10 20a2.2 2.2 0 0 0 4 0" />
                </>
            );
            break;
        case "calendar":
            icon = (
                <>
                    <path d="M7 4v3" />
                    <path d="M17 4v3" />
                    <path d="M5.5 6h13A1.5 1.5 0 0 1 20 7.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6Z" />
                    <path d="M4 10h16" />
                    <path d="M8 13.25h3" />
                    <path d="M8 16.5h6" />
                </>
            );
            break;
        case "check":
            icon = <path d="m6.5 12.5 3.5 3.5 7.5-8" />;
            break;
        case "checklist":
            icon = (
                <>
                    <path d="m4 7 1.5 1.5L8.5 5" />
                    <path d="M11 7h9" />
                    <path d="m4 14 1.5 1.5L8.5 12" />
                    <path d="M11 14h9" />

                </>
            );
            break;
        case "chevron-down":
            icon = <path d="m7 10 5 5 5-5" />;
            break;
        case "clock":
            icon = (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v4.5l3 1.8" />
                </>
            );
            break;
        case "company":
            icon = (
                <>
                    <path d="M4.5 20V8.5h9V20" />
                    <path d="M13.5 12h6V20" />
                    <path d="M3 20h18" />
                    <path d="M7.5 5h3v3.5h-3Z" />
                    <path d="M7.5 12h.01M10.5 12h.01M7.5 15.5h.01M10.5 15.5h.01M16.5 15.5h.01" />
                </>
            );
            break;
        case "contacts":
            icon = (
                <>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
                    <path d="M16 9.5a2.5 2.5 0 1 0-1.1-4.75" />
                    <path d="M15.5 14.25A4.6 4.6 0 0 1 20.2 19" />
                </>
            );
            break;
        case "dashboard":
            icon = (
                <>
                    <path d="M4.5 5.5h6v6h-6Z" />
                    <path d="M13.5 5.5h6v3.75h-6Z" />
                    <path d="M13.5 12.5h6v6h-6Z" />
                    <path d="M4.5 14.75h6v3.75h-6Z" />
                </>
            );
            break;
        case "document":
            icon = (
                <>
                    <path d="M7 4h6l4 4v12H7Z" />
                    <path d="M13 4v4h4" />
                    <path d="M9.5 12h5" />
                    <path d="M9.5 15h5" />
                </>
            );
            break;
        case "dots-vertical":
            icon = (
                <>
                    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                </>
            );
            break;
        case "edit":
            icon = (
                <>
                    <path d="M5 19h4.5L19 9.5 14.5 5 5 14.5Z" />
                    <path d="m13.5 6 4.5 4.5" />
                </>
            );
            break;
        case "external-link":
            icon = (
                <>
                    <path d="M14 5h5v5" />
                    <path d="m13 11 6-6" />
                    <path d="M19 14.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3.5" />
                </>
            );
            break;
        case "filter":
            icon = (
                <>
                    <path d="M4 6h16" />
                    <path d="M7 12h10" />
                    <path d="M10 18h4" />
                </>
            );
            break;
        case "history":
            icon = (
                <>
                    <path d="M5.5 9.5A7 7 0 1 1 5 15" />
                    <path d="M5.5 9.5H8" />
                    <path d="M5.5 9.5V7" />
                    <path d="M11 9V13l2.5 1.5" />
                </>
            );
            break;
        case "import":
            icon = (
                <>
                    <path d="M8 17H6.5A4.5 4.5 0 0 1 6 8.03 6 6 0 0 1 17.55 9.5H18a3.75 3.75 0 0 1 0 7.5h-2" />
                    <path d="M12 12v8" />
                    <path d="m8.5 15.5 3.5-3.5 3.5 3.5" />
                </>
            );
            break;
        case "info":
            icon = (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 11.5V16" />
                    <circle cx="12" cy="8.3" r=".65" fill="currentColor" stroke="none" />
                </>
            );
            break;
        case "ledger":
            icon = (
                <>
                    <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v12.5H8A3.5 3.5 0 0 1 4.5 16V7A2.5 2.5 0 0 1 7 4.5Z" />
                    <path d="M8 19.5A3.5 3.5 0 0 1 8 12h11.5" />
                    <path d="M9 8h6" />
                    <path d="M9 10.5h4" />
                </>
            );
            break;
        case "location":
            icon = (
                <>
                    <path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" />
                    <circle cx="12" cy="10" r="2.25" />
                </>
            );
            break;
        case "logout":
            icon = (
                <>
                    <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
                    <path d="M14 8l4 4-4 4" />
                    <path d="M18 12H9" />
                </>
            );
            break;
        case "menu":
            icon = (
                <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                </>
            );
            break;
        case "minus":
            icon = <path d="M7 12h10" />;
            break;
        case "moon":
            icon = <path d="M20 15.4A8.3 8.3 0 0 1 8.6 4a8.3 8.3 0 1 0 11.4 11.4Z" />;
            break;
        case "pipeline":
            icon = (
                <>
                    <path d="M6 6h4.5a3.5 3.5 0 0 1 3.5 3.5v0A3.5 3.5 0 0 0 17.5 13H20" />
                    <path d="M6 18h4.5a3.5 3.5 0 0 0 3.5-3.5v0A3.5 3.5 0 0 1 17.5 11H20" />
                    <circle cx="4.5" cy="6" r="2" />
                    <circle cx="4.5" cy="18" r="2" />
                    <circle cx="19.5" cy="12" r="2" />
                </>
            );
            break;
        case "plus":
            icon = (
                <>
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                </>
            );
            break;
        case "search":
            icon = (
                <>
                    <circle cx="11" cy="11" r="6.25" />
                    <path d="m16 16 4 4" />
                </>
            );
            break;
        case "salary":
            icon = (
                <>
                    <circle cx="12" cy="12" r="8" />
                    <path d="M15.5 8.7c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2 0 2.8 6 1.4 6 4.2 0 1.2-1.3 2.1-3 2.1-1.2 0-2.4-.4-3.2-1.2" />
                    <path d="M12.5 5.8v12.4" />
                </>
            );
            break;
        case "settings":
            icon = (
                <>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19 12a7.2 7.2 0 0 0-.1-1.1l2-1.55-2-3.45-2.35.95a7.5 7.5 0 0 0-1.9-1.1L14.3 3h-4.6l-.35 2.75a7.5 7.5 0 0 0-1.9 1.1L5.1 5.9l-2 3.45 2 1.55A7.2 7.2 0 0 0 5 12c0 .38.03.75.1 1.1l-2 1.55 2 3.45 2.35-.95a7.5 7.5 0 0 0 1.9 1.1L9.7 21h4.6l.35-2.75a7.5 7.5 0 0 0 1.9-1.1l2.35.95 2-3.45-2-1.55c.07-.35.1-.72.1-1.1Z" />
                </>
            );
            break;
        case "source":
            icon = (
                <>
                    <circle cx="6" cy="12" r="2.5" />
                    <circle cx="18" cy="6" r="2.5" />
                    <circle cx="18" cy="18" r="2.5" />
                    <path d="m8.2 10.9 7.6-3.8" />
                    <path d="m8.2 13.1 7.6 3.8" />
                </>
            );
            break;
        case "sun":
            icon = (
                <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
                </>
            );
            break;
        case "trash":
            icon = (
                <>
                    <path d="M5 7h14" />
                    <path d="M10 7V5h4v2" />
                    <path d="M7 7l1 13h8l1-13" />
                    <path d="M10.5 11v5" />
                    <path d="M13.5 11v5" />
                </>
            );
            break;
        case "trend":
            icon = (
                <>
                    <path d="M4 17 9 12l3 3 7-8" />
                    <path d="M15 7h4v4" />
                </>
            );
            break;
        case "view":
            icon = (
                <>
                    <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" />
                    <circle cx="12" cy="12" r="2.25" />
                </>
            );
            break;
        case "view-off":
            icon = (
                <>
                    <path d="M3.5 12s3.2-5.5 8.5-5.5c1.5 0 2.8.4 3.9 1" />
                    <path d="M20.5 12s-3.2 5.5-8.5 5.5c-1.5 0-2.8-.4-3.9-1" />
                    <path d="m4 4 16 16" />
                </>
            );
            break;
        case "warning":
            icon = (
                <>
                    <path d="M12 4 21 20H3Z" />
                    <path d="M12 9v5" />
                    <circle cx="12" cy="17" r=".75" fill="currentColor" stroke="none" />
                </>
            );
            break;
        case "x":
            icon = (
                <>
                    <path d="M6.5 6.5 17.5 17.5" />
                    <path d="M17.5 6.5 6.5 17.5" />
                </>
            );
            break;
    }

    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
        >
            {icon}
        </svg>
    );
}

export function MetricIcon({ name, tone = "blue" }: { name: AppIconName; tone?: IconTone }) {
    return (
        <span className={`metric-icon ${tone}`}>
            <AppIcon name={name} size={25} strokeWidth={1.7} />
        </span>
    );
}
