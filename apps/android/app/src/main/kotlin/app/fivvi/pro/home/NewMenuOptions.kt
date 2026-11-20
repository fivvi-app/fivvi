package app.fivvi.pro.home

import app.fivvi.api.models.MeWorkspace

/**
 * What the **+** of the home offers (F020, F021 AC7), decided from the capabilities the API listed and nothing else:
 * *Privésessie* for whoever may plan sessions, *Groepsles* for whoever has `class.manage` (the Owner). A team member who
 * plans sessions but not classes sees no *Groepsles* and the line that the owner plans the group classes. Open Gym comes
 * later and is not in the menu.
 */
data class NewMenuOptions(val showsPrivateSession: Boolean, val showsGroupClass: Boolean) {
    /** The menu has something to offer. */
    val isVisible: Boolean get() = showsPrivateSession || showsGroupClass

    /** "Groepslessen van John's Gym plant de eigenaar.": the person plans sessions but not classes. */
    val showsGroupClassNote: Boolean get() = showsPrivateSession && !showsGroupClass

    companion object {
        /** The options of a workspace in which [mayShow] says whether the API lists a capability. */
        fun of(mayShow: (MeWorkspace.Capabilities) -> Boolean) = NewMenuOptions(
            showsPrivateSession = mayShow(MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_OWN) ||
                mayShow(MeWorkspace.Capabilities.SESSION_PERIOD_PRIVATE_PERIOD_MANAGE_PERIOD_ANY),
            showsGroupClass = mayShow(MeWorkspace.Capabilities.CLASS_PERIOD_MANAGE),
        )
    }
}
