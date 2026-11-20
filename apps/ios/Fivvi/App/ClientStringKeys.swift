import FivviStrings

/// The i18n keys the client app Fivvi uses directly, besides the shared ones of FivviStrings
/// (packages/i18n/{nl-NL,en}.json).
extension StringKey {
    static let appTitle = StringKey("app.title")
    static let clientNavHome = StringKey("clientNav.home")
    static let clientNavBook = StringKey("clientNav.book")
    static let clientNavProfile = StringKey("clientNav.profile")
    static let noWorkspaceTitle = StringKey("noWorkspace.title")
    static let noWorkspaceHaveLink = StringKey("noWorkspace.haveLink")
    static let noWorkspaceTeamHint = StringKey("noWorkspace.teamHint")
    static let profileLanguage = StringKey("profile.language")
    static let profileVersion = StringKey("profile.version")
    static let appLinkSoon = StringKey("appLink.soon")
    static let appLinkOpenInBrowser = StringKey("appLink.openInBrowser")
    static let appLinkBack = StringKey("appLink.back")
    static let signOutLabel = StringKey("signOut.label")
    static let userMenuError = StringKey("userMenu.error")
}
