/**
 * Generate WordPress compatible translations for each javascript entrypoint in
 * your project.
 *
 * The command requires that you use `parcel-bundler` together with the
 * `parcel-plugin-assets-list`-plugin. The plugin will generate a file called
 * `assets.json` in your dist-folder. From this we can connect generated
 * translations with the generated dist-files.
 *
 * The script expects the following structure:
 * - `/languages` Directory containing translation files
 * - `/src` Directory containing src files, and entrypoints specified in `src/assets.urls`
 * - `/dist` Directory containing built files with at least one file per entrypoint
 *
 * To utilize the translations in your plugin use the following:
 * @example
 * ```
 * wp_set_script_translations('scripts-handle', 'text-domain', plugin_dir_path(__FILE__) . '/dist');
 * ```
 */
import path from 'path';
import fs from 'fs-extra';
import execa from 'execa';
import madge from 'madge';
import _ from 'lodash';
import md5 from 'md5';
import { getData } from './data';

async function makeJson() {
  try {
    const { paths } = await getData();

    await Promise.all(Object.values(paths).map(p => fs.ensureDir(p)));

    const domain = await extractDomain(paths.dist);
    const originalTranslations = await getOriginalTranslations(
      paths.languages,
      paths.temp,
    );

    const manifest = await getAssetsManifest(paths.dist);

    const promises = [];
    for (const lang in originalTranslations) {
      const translations = originalTranslations[lang];
      promises.push(
        generateTranslations(manifest, translations, {
          lang,
          domain,
          paths,
        }),
      );
    }

    await Promise.all(promises);
  } catch (error) {
    console.error('Could not generate translations');
    console.error(error);
  }
}

/**
 * Extract the text domain from the first available pot file in the lanaguages
 * directory.
 *
 * This will throw an error if no pot or domain is found is found.
 *
 * @param {string} distDir Absolute path to dist directory where pot file should be located
 * @returns {Promise<string>}
 */
async function extractDomain(distDir) {
  const files = await fs.readdir(distDir);
  const translationFiles = files.filter(
    file => path.extname(file) === '.pot' || path.extname(file) === '.po',
  );

  if (translationFiles.length < 1) {
    throw new Error(
      'Could not extract text domain since no .po- or .pot-files were found in the languages directory.',
    );
  }

  for (let i = 0; i < translationFiles.length; i++) {
    const file = translationFiles[i];
    const content = await fs.readFile(path.join(distDir, file), 'utf-8');
    const [, domain] = content.match(/"x-domain: (\S+)\\n"/i);

    if (domain) return domain;
  }

  throw new Error(
    'No text domain found in the .po- and .pot files in the languages directory. Make sure you declare "X-Domain: text-domain\\n" in your translation files.',
  );
}

/**
 * Generate translations using the wp-cli command "wp i18n make-json" and
 * generate and group the translations based on the language code.
 *
 * The the returning object will have a key for each found language code and
 * each language code will hold an array of all JED-compatible translations
 *
 * @param {string} langDir Absolute path to language directory
 * @param {*} tempDir Temporary directory to generate json-files into
 * @return {Promise<{ [lang: string]: any[] }>}
 */
async function getOriginalTranslations(langDir, tempDir) {
  /**
   * We use the wp-cli to generate the json translation files.
   * It will find translations in all js-files in the project and extract the
   * strings from the po-files in the lanugages dir
   */
  await execa('wp', ['i18n', 'make-json', langDir, tempDir, '--no-purge']);
  const files = (await fs.readdir(tempDir)).filter(
    file => path.extname(file) === '.json',
  );

  const translations = await Promise.all(
    files.map(async file =>
      JSON.parse(await fs.readFile(path.join(tempDir, file))),
    ),
  );

  /**
   * We end by grouping all the translations into an object with the language
   * codes as keys.
   */
  return translations.reduce((acc, translation) => {
    const domain = translation.domain;
    const lang = translation.locale_data[domain][''].lang;
    return {
      ...acc,
      [lang]: [...(acc[lang] || []), translation],
    };
  }, {});
}

/**
 * Generate JED-compatible translations per language adhearing to the WordPress
 * standard where the resulting files will be named
 * "{domain}-{lang}-{md5 hash of file path relative to root}.json"
 *
 * Since the wp-cli will generate translations for each file in the project we
 * use [`madge`](https://github.com/pahen/madge) to extract the dependecies of
 * each entrypoint.
 *
 * Translations will be created for each entrypoint defined dist/assets.json.
 * This file should have the following structure:
 * ```json
 * {
 *   "{path_relative_to_src}.js": "{path_relative_to_dist}.{maybe_hash?}.js"
 * }
 * ```
 *
 * `madge` will even look up dynamic imports where filenames can be determined.
 * Note: If a project relies on dynamic imports where the files cannot be
 * statically determined translations needs to happen outside of these files.
 *
 * @param {{ [key: string]: string }} manifest Assets manifest object
 * @param {JED[]} translations Translation files generated by wp-cli
 * @param {object} options Options
 * @param {string} options.lang Language code
 * @param {string} options.domain Text domain
 * @param {{ [key: string]: string }} options.path
 * @return {Promise<void>}
 */
async function generateTranslations(
  manifest,
  translations,
  { lang, domain, paths },
) {
  const promises = [];

  for (const key in manifest) {
    /**
     * A manifest may contain other entrypoints then js files. But we're only
     * concerned by js-entrypoints
     */
    if (path.extname(key) !== '.js') continue;

    const srcFile = path.join(paths.src, key);
    const distFile = path.join(paths.dist, manifest[key]);

    const result = await madge(srcFile);
    const dependecies = Object.keys(result.obj()).map(dep => {
      return path.join(paths.src, dep);
    });

    const relatedTranslations = translations.filter(translation => {
      return dependecies.includes(path.join(paths.root, translation.source));
    });

    /**
     * If no related translations are found we will skip this entrypint and
     * continue with the rest.
     */
    if (relatedTranslations.length < 1) continue;

    const mergedTranslations = _.merge(...relatedTranslations);
    const originalDomain = mergedTranslations.domain;

    if (originalDomain && originalDomain !== domain) {
      mergedTranslations.locale_data[domain] =
        mergedTranslations.locale_data[originalDomain];
      delete mergedTranslations.locale_data[originalDomain];

      mergedTranslations.locale_data[domain][''].domain = domain;
      mergedTranslations.domain = domain;
    }

    const relativeFilename = distFile
      .replace(paths.root, '')
      .replace(/^\//, '');

    mergedTranslations.source = relativeFilename;

    const translationFileName = path.join(
      paths.dist,
      `${domain}-${lang}-${md5(relativeFilename)}.json`,
    );

    promises.push(
      fs.writeFile(
        translationFileName,
        JSON.stringify(mergedTranslations),
        'utf-8',
      ),
    );
  }

  await Promise.all(promises);
}

const getAssetsManifest = async distPath => {
  try {
    const content = await fs.readFile(path.join(distPath, 'assets.json'));
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      'Could not read assets.json manifest inside dist directory',
    );
  }
};

export { makeJson };
