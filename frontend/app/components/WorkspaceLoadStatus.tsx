type WorkspaceLoadStatusProps = {
    status: "loading" | "error";
    onRetry: () => void;
};

export function WorkspaceLoadStatus({ status, onRetry }: WorkspaceLoadStatusProps) {
    const isLoading = status === "loading";

    return (
        <section
            className="workspace-load-status"
            role={isLoading ? "status" : "alert"}
            aria-live="polite"
        >
            {isLoading && <span className="workspace-loading-spinner" aria-hidden="true" />}
            <h2>{isLoading ? "Loading your workspace…" : "We couldn’t load your workspace"}</h2>
            <p>
                {isLoading
                    ? "Fetching your applications and latest data."
                    : "Please try again to retrieve your applications and latest data."}
            </p>
            {!isLoading && (
                <button type="button" className="secondary" onClick={onRetry}>
                    Try again
                </button>
            )}
        </section>
    );
}
