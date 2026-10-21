package app.fivvi.pro

/** JUnit `Parameterized` arguments: every catalog language, named by its tag (nl-NL, en). */
fun appLanguageParameters(): List<Array<Any>> = AppLanguage.entries.map { arrayOf(it.tag, it) }
