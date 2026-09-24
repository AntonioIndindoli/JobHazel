# Collection styles

Applications, Interviews, Tasks, and Contacts share the collection layout and
`CollectionListControls`. The existing `application-*` class names are also used
by the other three views; they are not all application-specific.

- `59-collections.css`: shared headers, status summaries, search fields, filter
  chips, split panes, list rows, and status accents.
- `60-applications.css`, `70-interviews.css`, `80-tasks.css`, `85-contacts.css`:
  page-specific content, controls, and details.
- `91-detail-panels.css`: detail content and page-specific sections.
- `96-collection-detail.css`: sole owner of `.application-detail-panel`, including
  its box, application padding variant, theme, visibility, mobile overlay, and
  scoped reading styles. Change panel geometry here, not in page or workspace
  stylesheets. Child selectors use CSS nesting to keep the component scope
  explicit without repeating it on every rule.
- `93-collection-responsive.css`: collection navigation and compact layouts.
- `97-bulk-actions.css`: selection controls and bulk actions.
- `98-collection-controls.css`: search/filter/sort layout, expanded filters,
  applied chips, and their container queries. Keep workspace control overrides
  here rather than adding them to the entry workspace stylesheet.
- `99-entry-workspace.css`: final workspace surfaces, record presentation, and
  application reference detail cards.

Keep the import order in `globals.css`: foundations precede page-specific rules,
then responsive and theme refinements, then the final component/workspace styles.
Selectors and container-query specificity are intentional; changing either can
affect compact list panes even on a wide viewport. Use the existing surface,
text, border, and status variables for both light and dark themes.
