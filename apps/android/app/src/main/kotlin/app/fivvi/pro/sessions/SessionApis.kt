package app.fivvi.pro.sessions

import app.fivvi.api.apis.ClientsApi
import app.fivvi.api.apis.LocationsApi
import app.fivvi.api.apis.SessionsApi
import app.fivvi.api.apis.TeamApi
import app.fivvi.api.apis.TrainersApi
import app.fivvi.api.apis.WorkspacesApi

/** The generated API clients the private session screens (F020) read and write through. */
class SessionApis(
    val sessions: SessionsApi,
    val locations: LocationsApi,
    val trainers: TrainersApi,
    val team: TeamApi,
    val workspaces: WorkspacesApi,
    val clients: ClientsApi,
)
