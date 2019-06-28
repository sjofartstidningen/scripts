/**
 * Generate WordPress compatible translations for each javascript entrypoint in
 * your project.
 *
 * The script will generate translations for each entrypoint defined in
 * `package.json` under `wp.entrypoints`.
 *
 * The script expects the following structure:
 * - `/languages` Directory containing translation files
 * - `/src` Directory containing src files, and entrypoints specified in package.json
 * - `/dist` Directory containing built files with at least one file per entrypoint
 *
 * To utilize the translations in your plugin use the following:
 * @example
 * ```
 * wp_set_script_translations('scripts-handle', 'text-domain', plugin_dir_path(__FILE__) . '/dist');
 * ```
 */
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import execa from 'execa';
import madge from 'madge';
import _ from 'lodash';
import md5 from 'md5';
import { getData } from './data';

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function makeJson() {
  try {
    const { package: pkg, paths } = await getData();

    if (pkg.wp == null || pkg.wp.entrypoints == null) {
      throw new Error('wp.entrypoints must be specified in package.json.');
    }

    await Promise.all(
      Object.values(paths).map(p => mkdir(p, { recursive: true })),
    );

    const domain = await extractDomain(paths.dist);
    const originalTranslations = await getOriginalTranslations(
      paths.languages,
      paths.temp,
    );

    const promises = [];
    for (const lang in originalTranslations) {
      const translations = originalTranslations[lang];
      promises.push(
        generateTranslations(pkg.wp.entrypoints, translations, {
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
  const files = await readdir(distDir);
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
    const content = await readFile(path.join(distDir, file), 'utf-8');
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
  const files = (await readdir(tempDir)).filter(
    file => path.extname(file) === '.json',
  );

  const translations = await Promise.all(
    files.map(async file =>
      JSON.parse(await readFile(path.join(tempDir, file))),
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
 * Translations will be created for each entrypoint defined in package.json
 * under `wp.entrypoints`.
 * This property should be pointing to entrypoints in the src-directory and
 * expects the build script to output a file with the same name but in the
 * dist-directory.
 *
 * `madge` will even look up dynamic imports where filenames can be determined.
 * Note: If a project relies on dynamic imports where the files cannot be
 * statically determined translations needs to happen outside of these files.
 *
 * @param {string[]} entrypoints Array of entrypoints defined in package.json.wp
 * @param {JED[]} translations Translation files generated by wp-cli
 * @param {object} options Options
 * @param {string} options.lang Language code
 * @param {string} options.domain Text domain
 * @param {{ [key: string]: string }} options.path
 * @return {Promise<void>}
 */
async function generateTranslations(
  entrypoints,
  translations,
  { lang, domain, paths },
) {
  const promises = [];
  const manifest = await getAssetsManifest(paths.dist);

  for (let i = 0; i < entrypoints.length; i++) {
    const entrypoint = path.join(paths.root, entrypoints[i]);
    const basename = path.basename(entrypoint);

    if (!(basename in manifest)) {
      console.log(`Entrypoint ${entrypoints[i]} not found in manifest`);
      continue;
    }

    const result = await madge(entrypoint);
    const dependecies = Object.keys(result.obj()).map(dep =>
      path.join(paths.src, dep),
    );

    const relatedTranslations = translations.filter(translation => {
      return dependecies.includes(path.join(paths.root, translation.source));
    });

    const mergedTranslations = _.merge(...relatedTranslations);
    const originalDomain = mergedTranslations.domain;

    if (originalDomain !== domain) {
      mergedTranslations.locale_data[domain] =
        mergedTranslations.locale_data[originalDomain];
      delete mergedTranslations.locale_data[originalDomain];

      mergedTranslations.locale_data[domain][''].domain = domain;
      mergedTranslations.domain = domain;
    }

    mergedTranslations.source = path
      .join(paths.dist, manifest[path.basename(entrypoint)])
      .replace(paths.root, '')
      .replace(/^\//, '');

    const file = path.join(
      paths.dist,
      `${domain}-${lang}-${md5(mergedTranslations.source)}.json`,
    );

    promises.push(writeFile(file, JSON.stringify(mergedTranslations), 'utf-8'));
  }

  await Promise.all(promises);
}

const getAssetsManifest = async distPath => {
  try {
    const content = await readFile(path.join(distPath, 'assets.json'));
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      'Could not read assets.json manifest inside dist directory',
    );
  }
};

export { makeJson };
