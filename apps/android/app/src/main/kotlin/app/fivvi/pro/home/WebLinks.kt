package app.fivvi.pro.home

/** Where the app sends the person on the web. */
object WebLinks {
    /**
     * Trainer web's first-run screen (`/welcome`, TW-11), on the server that serves the API: the API is mounted at
     * `/api` of the web app, so the web address is the API base URL without that path. The app never creates or renames
     * a workspace; it opens this address in the system browser.
     */
    fun welcomeUrl(apiBaseUrl: String): String = apiBaseUrl.trimEnd('/').removeSuffix("/api") + "/welcome"
}
