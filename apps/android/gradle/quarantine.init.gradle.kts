// The unit tests of the quarantine list (E002 #1363, quarantine/compose.txt, TESTING.md §8). scripts/_android.sh passes this
// init script (`gradle --init-script`) with FIVVI_QUARANTINE_TESTS, the listed tests as `app.fivvi.pro.Class#method`, comma
// separated, to the Gradle runs that test: every unit test task leaves the listed tests out, or, with FIVVI_QUARANTINE=only
// (the Quarantine job), runs only them. A test is left out, not skipped: the Quarantine job runs it. The Compose UI tests
// are filtered by the instrumentation runner's arguments instead (scripts/_android.sh, gradle_connected).
import org.gradle.api.tasks.testing.Test

val listed = (System.getenv("FIVVI_QUARANTINE_TESTS") ?: "").split(",").map { it.trim() }.filter { it.isNotEmpty() }
val only = System.getenv("FIVVI_QUARANTINE") == "only"

allprojects {
    tasks.withType(Test::class.java).configureEach {
        filter {
            // A module without a listed test has nothing to run with `only`.
            isFailOnNoMatchingTests = false
            for (name in listed) {
                // Gradle names a method `Class.method`.
                val pattern = name.replace('#', '.')
                if (only) includeTestsMatching(pattern) else excludeTestsMatching(pattern)
            }
        }
    }
}
