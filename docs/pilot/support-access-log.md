# Support access log

Every time the owner looks at a workspace's data to answer a support request or to handle an incident, one row is added here, before the look, as [runbook 8](../engineering/RUNBOOKS.md#8-support-access) says (`role-mapping.md` §6.5: it happens at the workspace's request or with its knowledge, and it is logged). The gym can ask for the rows about its workspace.

**This repository is public: nothing that identifies a gym, a workspace (no slug), a person or a client goes in this file.** An entry holds only the date, an opaque reference (a number the owner keeps in their own records and can map to the workspace) and the category. Write which kind of data was looked at ("the bookings of one day", "one client's agreement"), never the people or the values. Rows are kept 12 months, like the audit log (`retention-policy.md` R12); remove older rows when you add one, and know that removed rows stay in git history, so write nothing you would need to remove. The owner decides where the real log lives; the gym can ask for the rows about its workspace.

| Date (UTC) | Reference | Why (request or incident) | How the gym knew (its request, or told when) | What was looked at | Note content viewed? (yes or no, and why) | By | Ended (UTC) |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
