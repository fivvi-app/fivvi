import { getRequestConfig } from 'next-intl/server';
import { intlConfig } from './config';
import { currentLocale } from './current-locale';

export default getRequestConfig(async () => intlConfig(await currentLocale()));
