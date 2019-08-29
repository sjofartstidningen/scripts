/**
 * The wp-cli has a built in command to generate .pot-files and extract
 * translation strings from php- and javascript-files.
 * But it lacks support for modern js and when it meets someting out of the
 * ordinary, e.g. a dynamic import it will bail on that file and continue its
 * work on the next file.
 *
 * This script exposes a work around where dynamic imports will be removed
 * before running `wp i18n make-pot`.
 * After completion the original files are restored.
 */
import path from 'path';
import fs from 'fs-extra';
import replace from 'replace-in-file';
import execa from 'execa';
import { getData } from './data';

/**
 * Extract translation strings from php, twig and modern js files.
 */
async function makePot() {
  const { package: pkg, paths } = await getData(false);
  const tmpSrc = path.join(paths.temp, 'src');
  const tmpTwigDir = path.join(paths.root, '.temp-twig');

  try {
    // We back up the original source files inside a temporary directory
    await fs.copy(paths.src, tmpSrc);

    // All `import()` calls will just be commented out
    await replace({
      files: path.join(paths.src, '**/*.js'),
      from: /.+import\(.+\);?/g,
      to: match => `// ${match}`,
    });

    /**
     * The wp cli command will ignore twig files. We therefore convert all twig
     * files to php files replacing translation functions with normal php
     * translation functions.
     * And also convert all .twig-files into .php-files that wp-cli will
     * recognize and extract translations from.
     */
    await convertTwigFiles(tmpTwigDir);

    // When replacemnets are done wp-cli can do it's work
    const potPath = path.join(
      paths.dist,
      `${pkg.name.replace(/^(@\w+\/)/, '')}.pot`,
    );
    await execa('wp', ['i18n', 'make-pot', '.', potPath, '--exclude=dist']);

    /**
     * After wp cli has extracted all translation string the pot will point to
     * missing files for twig views. We will replace all temporary pointers
     * to their original versions.
     */
    await updateTwigFilePaths(tmpTwigDir, potPath);
  } catch (error) {
    console.error('An error occured while generating a .pot-file');
    console.error(error);
  } finally {
    /**
     * We use the finally block to make sure that orginal files are always
     * copied back to its source, event if an error occurs.
     *
     * We catch any errors from these calls since they're not important and will
     * most likely mean that we didn't even reach a point where we backed up the
     * src directory.
     */
    await fs.copy(tmpSrc, paths.src).catch(() => {});
    await fs.remove(tmpSrc).catch(() => {});
    await fs.remove(tmpTwigDir).catch(() => {});
  }
}

/**
 * Regexes matching translations functions in twig-files
 */
const gettextRegex = [
  // _e( "text", "domain" )
  // __( "text", "domain" )
  // translate( "text", "domain" )
  // esc_attr__( "text", "domain" )
  // esc_attr_e( "text", "domain" )
  // esc_html__( "text", "domain" )
  // esc_html_e( "text", "domain" )
  /(__|_e|translate|esc_attr__|esc_attr_e|esc_html__|esc_html_e)\(\s*?['"].+?['"]\s*?,\s*?['"].+?['"]\s*?\)/g,

  // _n( "single", "plural", number, "domain" )
  /_n\(\s*?['"].*?['"]\s*?,\s*?['"].*?['"]\s*?,\s*?.+?\s*?,\s*?['"].+?['"]\s*?\)/g,

  // _x( "text", "context", "domain" )
  // _ex( "text", "context", "domain" )
  // esc_attr_x( "text", "context", "domain" )
  // esc_html_x( "text", "context", "domain" )
  // _nx( "single", "plural", "number", "context", "domain" )
  /(_x|_ex|_nx|esc_attr_x|esc_html_x)\(\s*?['"].+?['"]\s*?,\s*?['"].+?['"]\s*?,\s*?['"].+?['"]\s*?\)/g,

  // _n_noop( "singular", "plural", "domain" )
  // _nx_noop( "singular", "plural", "context", "domain" )
  /(_n_noop|_nx_noop)\((\s*?['"].+?['"]\s*?),(\s*?['"]\w+?['"]\s*?,){0,1}\s*?['"].+?['"]\s*?\)/g,
];

/**
 * Convert all twig-files to valid php-files with translation functions
 * correctly defined.
 *
 * `{{ __('News', 'domain') }}` => `<?php __('News', 'domain'); ?>`
 *
 * @param {string} tempFolder
 */
async function convertTwigFiles(tempFolder) {
  const { paths } = await getData(false);

  // If the project don't use the views-folder everything below will be ignored
  const hasViews = await fs.pathExists(paths.views);
  if (!hasViews) return;

  // Copy all views to new folder
  await fs.copy(paths.views, tempFolder);

  // Replace all translator function to valid php
  for (let regex of gettextRegex) {
    await replace({
      files: path.join(tempFolder, '**/*.twig'),
      from: regex,
      to: match => `<?php ${match}; ?>`,
    });
  }

  // Get all files in the temp folder and change the extension to .php
  const files = readdirRecursive(tempFolder);
  for (let file of files) {
    await fs.move(file, file.replace(/\.twig$/, '.php'));
  }
}

/**
 * Replace all pointers to the temporary twig-files to the original source
 *
 * @param {string} tempDir
 * @param {string} potPath
 */
async function updateTwigFilePaths(tempDir, potPath) {
  const { paths } = await getData(false);
  const tempFolderRelative = tempDir.replace(path.join(paths.root, '/'), '');
  const viewsFolderRelative = paths.views.replace(
    path.join(paths.root, '/'),
    '',
  );

  const potContent = await fs.readFile(potPath, 'utf-8');
  const updatedPotContent = potContent.replace(
    new RegExp(`(${tempFolderRelative})\\/.+(\.php)`, 'g'),
    (match, folder, ext) => {
      return match.replace(folder, viewsFolderRelative).replace(ext, '.twig');
    },
  );

  await fs.writeFile(potPath, updatedPotContent, 'utf-8');
}

/**
 * Reads the content of a directory returning an array of paths to all files
 * within the directory and its children.
 *
 * @param {string} dir
 * @return {string[]}
 */
function readdirRecursive(dir) {
  const content = fs.readdirSync(dir);

  return content.reduce((acc, item) => {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isFile()) {
      return [...acc, itemPath];
    }

    return [...acc, ...readdirRecursive(itemPath)];
  }, []);
}

export { makePot };
