package app.fivvi.pro.workspace

import java.util.UUID

/** The workspace used last, kept in memory: a test's device. Pass the same one to a second launch to keep it across a restart. */
class InMemoryLastWorkspaceStore(override var id: UUID? = null) : LastWorkspaceStore
