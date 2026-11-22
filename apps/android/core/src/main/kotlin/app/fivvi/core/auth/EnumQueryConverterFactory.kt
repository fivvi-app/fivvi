package app.fivvi.core.auth

import app.fivvi.api.infrastructure.Serializer
import java.lang.reflect.Type
import kotlinx.serialization.serializer
import retrofit2.Converter
import retrofit2.Retrofit

/**
 * Writes an enum in a query (`?surface=android`) as the contract names it, its `@SerialName`, not as Kotlin names it
 * (`ANDROID`): Retrofit's own conversion of a query value is `toString()`, and the API refuses a value it doesn't know
 * with `400 validation_failed`. The generated clients are not edited; this goes in front of their converters.
 */
class EnumQueryConverterFactory : Converter.Factory() {
    override fun stringConverter(
        type: Type,
        annotations: Array<Annotation>,
        retrofit: Retrofit,
    ): Converter<*, String>? {
        if (type !is Class<*> || !type.isEnum) return null
        val names = Serializer.kotlinxSerializationJson.serializersModule.serializer(type).descriptor
        return Converter<Any, String> { value -> names.getElementName((value as Enum<*>).ordinal) }
    }
}
