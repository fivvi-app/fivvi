import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_ROOT,
  GENERATED_PATHS,
  KOTLIN_SERIALIZER,
  leaveUnsetFieldsOut,
} from '../scripts/pipeline.ts';

// #371: the Kotlin client must leave an unset optional field out of a request, as the Swift client does. The API
// answers `null` with 400, so the Android language save (`name` unset) was refused. The behaviour is proven through
// the generated Retrofit API in apps/android (UpdateMeRequestTest); this guards the pipeline step that produces it.

const GENERATED = `import kotlinx.serialization.json.Json
object Serializer {
    @JvmStatic
    val kotlinxSerializationJson: Json by lazy {
        Json {
            serializersModule = kotlinxSerializationAdapters
            encodeDefaults = true
            ignoreUnknownKeys = true
        }
    }
}
`;

describe('the Kotlin Serializer', () => {
  it('leaves unset fields out, keeping the other settings', () => {
    const adjusted = leaveUnsetFieldsOut(GENERATED);

    expect(adjusted).toContain(
      '            encodeDefaults = true\n            explicitNulls = false\n',
    );
    expect(adjusted).toContain('ignoreUnknownKeys = true');
    expect(adjusted).toContain('@OptIn(ExperimentalSerializationApi::class)');
    expect(adjusted).toContain('import kotlinx.serialization.ExperimentalSerializationApi\n');
  });

  it('fails when a new generator version no longer has the line to adjust', () => {
    expect(() => leaveUnsetFieldsOut('object Serializer {}\n')).toThrow(/encodeDefaults/);
  });

  it.each([
    ['the encodeDefaults line', '            encodeDefaults = true\n', /encodeDefaults/],
    [
      'the property to annotate',
      '    @JvmStatic\n    val kotlinxSerializationJson: Json by lazy {',
      /kotlinxSerializationJson/,
    ],
    ['the Json import', 'import kotlinx.serialization.json.Json\n', /Json. import/],
  ])('fails when %s is missing, not later in the Gradle build', (_name, anchor, message) => {
    expect(GENERATED).toContain(anchor);

    expect(() => leaveUnsetFieldsOut(GENERATED.replace(anchor, ''))).toThrow(message);
  });

  it('is applied to the committed Kotlin client', async () => {
    const committed = await readFile(
      join(CONTRACT_ROOT, GENERATED_PATHS.kotlin, KOTLIN_SERIALIZER),
      'utf8',
    );

    expect(committed).toContain('explicitNulls = false');
  });
});
