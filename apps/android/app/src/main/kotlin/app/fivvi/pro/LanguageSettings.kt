package app.fivvi.pro

import android.app.LocaleManager
import android.content.Context
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import java.util.Locale

/** The OS inputs of [AppLanguage.resolve]. */
interface LanguageSettings {
    /** The language chosen for this app in Android settings (API 33+); empty when none is chosen. */
    val perAppLanguages: List<Locale>

    /** The device's preferred languages in order, unaffected by the per-app language. */
    val deviceLanguages: List<Locale>
}

class SystemLanguageSettings(private val context: Context) : LanguageSettings {
    override val perAppLanguages: List<Locale>
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.getSystemService(LocaleManager::class.java).applicationLocales.toList()
        } else {
            emptyList()
        }

    override val deviceLanguages: List<Locale>
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.getSystemService(LocaleManager::class.java).systemLocales.toList()
        } else {
            Resources.getSystem().configuration.locales.toList()
        }
}

private fun LocaleList.toList(): List<Locale> = List(size()) { get(it) }
