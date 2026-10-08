import { AppIcon } from "./AppIcon";

const posting = {
    role: "Product Designer",
    company: "Northstar",
    location: "Remote",
    salary: "$120,000–$160,000",
    description: "Design thoughtful tools that help people do their best work.",
};

const extractedFields = [
    { key: "role", label: "Role", value: posting.role },
    { key: "company", label: "Company", value: posting.company },
    { key: "location", label: "Location", value: posting.location },
    { key: "salary", label: "Salary", value: posting.salary },
    { key: "description", label: "Description", value: posting.description },
];

export function LandingImportDemo() {
    return (
        <figure className="story-import-demo" aria-label="Illustration of matching details automatically extracted from a job posting">
            <div className="import-demo-flow">
                <section className="import-demo-posting" aria-label="Job posting excerpt">
                    <span className="import-demo-section-label">Job posting</span>
                    <div className="import-demo-posting-body">
                        <span className="import-demo-company"><mark data-field="company">{posting.company}</mark> · Careers</span>
                        <h4><mark data-field="role">{posting.role}</mark></h4>
                        <p className="import-demo-meta"><mark data-field="location">{posting.location}</mark> · Full-time</p>
                        <p className="import-demo-salary"><mark data-field="salary">{posting.salary}</mark> / year</p>
                        <span className="import-demo-posting-label">About the role</span>
                        <p className="import-demo-description"><mark data-field="description">{posting.description}</mark></p>
                    </div>
                </section>
                <div className="import-demo-connector" aria-hidden="true">
                    <AppIcon name="arrow-right" size={36} />
                </div>
                <section className="import-demo-details" aria-labelledby="import-details-title">
                    <h4 id="import-details-title">Automatically extracted</h4>
                    <dl>
                        {extractedFields.map((field) => (
                            <div key={field.key} data-field={field.key} className={field.key === "description" ? "import-demo-description-field" : undefined}>
                                <dt>{field.label}</dt>
                                <dd><mark>{field.value}</mark></dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
            <figcaption><span>Automatic extraction</span><span className="story-example-label">Illustrated example</span></figcaption>
        </figure>
    );
}
