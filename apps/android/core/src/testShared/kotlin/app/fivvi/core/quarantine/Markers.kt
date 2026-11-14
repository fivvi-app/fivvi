package app.fivvi.core.quarantine

/*
 * The markers of the tests that are never quarantined (ADR-025, TESTING.md section 8). A flaky test of these kinds is
 * fixed, or the change that broke it is reverted; scripts/quarantine.mjs refuses a quarantine/compose.txt entry whose test
 * carries one. Put the annotation on the test method, or on the class for all its tests, and in the line above it.
 */

/** A tenant isolation test: one workspace never sees the data of another. */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class Isolation

/** A concurrency test: two actions at once, a race, a double submit. */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class Concurrency

/** A permission test: a role or capability may, or may not, do something. */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class Permission
