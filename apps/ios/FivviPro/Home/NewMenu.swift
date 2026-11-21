import FivviStrings

/// What the **+** in the home's bar offers (F020, F021 AC7), decided from the capabilities the API listed and nothing
/// else: *Privésessie* for whoever may plan sessions, *Groepsles* for whoever has `class.manage` (the Owner). A team
/// member who plans sessions but not classes sees no *Groepsles* and the line that the owner plans the group classes.
/// Open Gym comes later and is not in the menu.
struct NewMenu: Equatable {
    let showsPrivateSession: Bool
    let showsGroupClass: Bool

    @MainActor
    init(capabilities: WorkspaceCapabilities) {
        showsPrivateSession = capabilities.allows(.session_private_manage_own)
            || capabilities.allows(.session_private_manage_any)
        showsGroupClass = capabilities.allows(.class_manage)
    }

    /// The menu has something to offer.
    var isVisible: Bool { showsPrivateSession || showsGroupClass }

    /// "Groepslessen van John's Gym plant de eigenaar.": the person plans sessions but not classes.
    var showsGroupClassNote: Bool { showsPrivateSession && !showsGroupClass }

    func groupClassNote(workspaceName: String, catalog: Catalog) -> String {
        catalog.string(.newGroupClassNote, workspaceName)
    }
}
