type ExtensionCaptureNoticeProps = {
    kind: "info" | "error";
    message: string;
    onDismiss: () => void;
    onRetry?: () => void;
};

export function ExtensionCaptureNotice({
    kind,
    message,
    onDismiss,
    onRetry,
}: ExtensionCaptureNoticeProps) {
    return (
        <div
            className={`extension-capture-notice ${kind}`}
            role={kind === "error" ? "alert" : "status"}
        >
            <span>{message}</span>
            <div className="extension-capture-notice-actions">
                {onRetry && (
                    <button type="button" onClick={onRetry}>
                        Retry
                    </button>
                )}
                <button type="button" aria-label="Dismiss capture message" onClick={onDismiss}>
                    ×
                </button>
            </div>
        </div>
    );
}
