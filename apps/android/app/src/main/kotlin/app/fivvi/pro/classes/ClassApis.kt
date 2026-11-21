package app.fivvi.pro.classes

import app.fivvi.api.apis.GroupClassesApi
import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi

/** The generated API clients the group class screens (F021) read and write through. */
class ClassApis(
    val classes: GroupClassesApi,
    val sessions: SessionsApi,
    val locations: LocationsApi,
    val trainers: TrainersApi,
    val workspaces: WorkspacesApi,
)
